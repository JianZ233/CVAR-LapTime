import { redisCommand, redisIsConfigured, redisPipeline } from './_redis.js';
import { readAdjustments } from './_adjustments.js';
import {
  racePositionForCar,
  readRacePositions,
  snapshotUsesRacePositions,
} from './_race_positions.js';
import { applyManualSessionResult } from './_manual-results.js';

type SessionSummary = {
  id: string;
  startedAt: string;
  runId: string;
  runName: string;
  flag: string;
  groups: string[];
  carCount: number;
  updatedAt: string;
};

export async function GET(request: Request) {
  if (!redisIsConfigured())
    return Response.json(
      { error: 'Timing storage is not configured' },
      { status: 503, headers: noStoreHeaders },
    );

  const url = new URL(request.url);
  const eventId = url.searchParams.get('event') || 'canyon-classic-2026';
  const sessionId = url.searchParams.get('session');
  if (!safeId(eventId) || (sessionId && !safeId(sessionId)))
    return Response.json(
      { error: 'Invalid event or session identifier' },
      { status: 400, headers: noStoreHeaders },
    );

  try {
    return sessionId
      ? await readSession(eventId, sessionId)
      : await listSessions(eventId);
  } catch (error) {
    console.error('Unable to read public timing sessions', error);
    return Response.json(
      { error: 'Unable to read timing sessions' },
      { status: 502, headers: noStoreHeaders },
    );
  }
}

async function listSessions(eventId: string) {
  const eventPrefix = `cvar:event:${eventId}`;
  const [liveSessionValue, sessionValues] = await Promise.all([
    redisCommand(['GET', 'cvar:live-session']),
    redisCommand(['ZRANGE', `${eventPrefix}:sessions`, -100, -1, 'WITHSCORES']),
  ]);
  const pairs = Array.isArray(sessionValues) ? sessionValues.map(String) : [];
  const ids = pairs.filter((_, index) => index % 2 === 0);
  const storedSummaries = ids.length
    ? await redisCommand(['HMGET', `${eventPrefix}:session-summaries`, ...ids])
    : [];
  const summaryValues = Array.isArray(storedSummaries) ? storedSummaries : [];
  const missingIds = ids.filter(
    (_, index) => typeof summaryValues[index] !== 'string',
  );
  const fallbackResults = missingIds.length
    ? ((await redisPipeline(
        missingIds.map((id) => ['GET', `${eventPrefix}:session:${id}:latest`]),
      )) as Array<{ result?: unknown }>)
    : [];
  const fallbackById = new Map(
    missingIds.map((id, index) => [id, fallbackResults[index]?.result]),
  );

  const parsedSessions: SessionSummary[] = ids
    .flatMap((id, index) => {
      const rawSummary =
        typeof summaryValues[index] === 'string'
          ? summaryValues[index]
          : fallbackById.get(id);
      const summary = parseSummary(rawSummary);
      if (!summary) return [];
      return [
        {
          id,
          startedAt: new Date(Number(pairs[index * 2 + 1])).toISOString(),
          ...summary,
        },
      ];
    })
    .reverse();
  const liveSessionId =
    typeof liveSessionValue === 'string' ? liveSessionValue : '';
  const sessions = deduplicateSessions(parsedSessions, liveSessionId);

  return Response.json(
    {
      eventId,
      liveSessionId,
      sessions,
    },
    { headers: listHeaders },
  );
}

function deduplicateSessions(
  sessions: SessionSummary[],
  liveSessionId: string,
) {
  const preferredByRace = new Map<string, SessionSummary>();

  for (const session of sessions) {
    if (session.id === liveSessionId) continue;
    const key = `${session.runName.trim().toLowerCase()}|${session.groups
      .map((group) => group.trim().toLowerCase())
      .sort()
      .join(',')}`;
    const preferred = preferredByRace.get(key);
    if (!preferred || sessionQuality(session) > sessionQuality(preferred))
      preferredByRace.set(key, session);
  }

  const visibleIds = new Set(
    [...preferredByRace.values()].map((session) => session.id),
  );
  if (liveSessionId) visibleIds.add(liveSessionId);
  return sessions.filter((session) => visibleIds.has(session.id));
}

function sessionQuality(session: SessionSummary) {
  const finished = session.flag.trim().toUpperCase() === 'FINISH' ? 1 : 0;
  const updatedAt = Date.parse(session.updatedAt) || 0;
  return (
    finished * 1_000_000_000_000_000 +
    session.carCount * 1_000_000_000 +
    updatedAt
  );
}

async function readSession(eventId: string, sessionId: string) {
  const sessionPrefix = `cvar:event:${eventId}:session:${sessionId}`;
  const [stored, adjustments] = await Promise.all([
    redisCommand(['GET', `${sessionPrefix}:latest`]),
    readAdjustments(eventId, sessionId),
  ]);
  if (typeof stored !== 'string')
    return Response.json(
      { error: 'Session not found' },
      { status: 404, headers: noStoreHeaders },
    );
  const racePositions = snapshotUsesRacePositions(stored)
    ? await readRacePositions(sessionPrefix)
    : {};
  const storedSnapshot = sanitizeSnapshot(stored, adjustments, racePositions);
  const snapshot = storedSnapshot
    ? applyManualSessionResult(
        eventId === 'canyon-classic-2026' ? sessionId : '',
        storedSnapshot,
      )
    : null;
  if (!snapshot)
    return Response.json(
      { error: 'Session data is unavailable' },
      { status: 502, headers: noStoreHeaders },
    );
  return Response.json(
    { eventId, sessionId, snapshot },
    { headers: sessionHeaders },
  );
}

function parseSummary(value: unknown) {
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const snapshot = parsed as Record<string, unknown>;
    if (typeof snapshot.runName !== 'string') return null;
    const carCount =
      typeof snapshot.carCount === 'number'
        ? snapshot.carCount
        : Array.isArray(snapshot.cars)
          ? snapshot.cars.length
          : 0;
    if (!Number.isFinite(carCount) || carCount <= 0) return null;
    return {
      runId: typeof snapshot.runId === 'string' ? snapshot.runId : '',
      runName: snapshot.runName,
      flag: typeof snapshot.flag === 'string' ? snapshot.flag : '',
      groups: Array.isArray(snapshot.groups)
        ? snapshot.groups.filter(
            (group): group is string => typeof group === 'string',
          )
        : [],
      carCount,
      updatedAt:
        typeof snapshot.updatedAt === 'string' ? snapshot.updatedAt : '',
    };
  } catch {
    return null;
  }
}

function sanitizeSnapshot(
  value: string,
  adjustments: Awaited<ReturnType<typeof readAdjustments>>,
  racePositions: Record<string, number>,
) {
  try {
    const snapshot = JSON.parse(value) as Record<string, unknown>;
    if (typeof snapshot.runName !== 'string' || !Array.isArray(snapshot.cars))
      return null;
    return {
      eventName: stringValue(snapshot.eventName),
      trackName: stringValue(snapshot.trackName),
      trackLength: stringValue(snapshot.trackLength),
      runId: stringValue(snapshot.runId),
      runName: snapshot.runName,
      sessionMode: snapshot.sessionMode === 'race' ? 'race' : 'practice',
      flag: stringValue(snapshot.flag),
      flagStartedAt: stringValue(snapshot.flagStartedAt),
      lapsToGo:
        typeof snapshot.lapsToGo === 'number' ? snapshot.lapsToGo : null,
      timeToGo: stringValue(snapshot.timeToGo),
      timeOfDay: stringValue(snapshot.timeOfDay),
      raceTime: stringValue(snapshot.raceTime),
      initializedAt: stringValue(snapshot.initializedAt),
      classes: Array.isArray(snapshot.classes) ? snapshot.classes : [],
      groups: Array.isArray(snapshot.groups)
        ? snapshot.groups.filter(
            (group): group is string => typeof group === 'string',
          )
        : [],
      settings:
        snapshot.settings && typeof snapshot.settings === 'object'
          ? snapshot.settings
          : {},
      source:
        snapshot.source && typeof snapshot.source === 'object'
          ? snapshot.source
          : { protocol: 'RMonitor', recordsCaptured: 0, commandCounts: {} },
      updatedAt: stringValue(snapshot.updatedAt),
      cars: snapshot.cars
        .map((car) => sanitizeCar(car, racePositions))
        .filter((car): car is NonNullable<typeof car> => Boolean(car))
        .map((car) => ({
          ...car,
          resultAdjustment:
            adjustments[car.registrationKey || car.registrationNumber],
        })),
    };
  } catch {
    return null;
  }
}

function sanitizeCar(value: unknown, racePositions: Record<string, number>) {
  if (!value || typeof value !== 'object') return null;
  const car = value as Record<string, unknown>;
  return {
    registrationKey: stringValue(car.registrationKey),
    registrationNumber: stringValue(car.registrationNumber),
    number: stringValue(car.number),
    driver: stringValue(car.driver),
    car: stringValue(car.car),
    groupName: stringValue(car.groupName),
    classNumber: typeof car.classNumber === 'number' ? car.classNumber : null,
    className: stringValue(car.className),
    position: numberValue(car.position),
    racePosition: racePositionForCar(car, racePositions),
    positionChange: numberValue(car.positionChange),
    laps: numberValue(car.laps),
    bestLapNumber: numberValue(car.bestLapNumber),
    latestLapNumber: numberValue(car.latestLapNumber),
    latestScoreType: stringValue(car.latestScoreType),
    ambiguousRegistrationNumber: car.ambiguousRegistrationNumber === true,
    totalTime: stringValue(car.totalTime),
    lastLap: stringValue(car.lastLap),
    bestLap: stringValue(car.bestLap),
    gap: stringValue(car.gap),
    points: nullableNumber(car.points),
  };
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}
function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
function nullableNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function safeId(value: string) {
  return /^[a-z0-9][a-z0-9-]{0,119}$/i.test(value);
}

const noStoreHeaders = { 'cache-control': 'no-store, max-age=0' };
const listHeaders = {
  'cache-control': 'public, max-age=0, must-revalidate',
  'vercel-cdn-cache-control': 'public, s-maxage=5, stale-while-revalidate=5',
};
const sessionHeaders = {
  'cache-control': 'public, max-age=0, must-revalidate',
  'vercel-cdn-cache-control': 'public, s-maxage=2, stale-while-revalidate=5',
};
