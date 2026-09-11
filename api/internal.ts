import { adminRequestIsAuthorized } from './_admin-auth.js';
import { redisCommand, redisIsConfigured } from './_redis.js';

export async function GET(request: Request) {
  if (!adminRequestIsAuthorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: noStoreHeaders });
  if (!redisIsConfigured()) return Response.json({ error: 'Timing storage is not configured' }, { status: 503, headers: noStoreHeaders });

  const url = new URL(request.url);
  const eventId = url.searchParams.get('event') || 'canyon-classic-2026';
  const sessionId = url.searchParams.get('session');
  if (!safeId(eventId) || (sessionId && !safeId(sessionId))) return Response.json({ error: 'Invalid event or session identifier' }, { status: 400, headers: noStoreHeaders });

  try {
    if (sessionId) return await readSession(eventId, sessionId, url);
    return await readControlRoom(eventId);
  } catch (error) {
    console.error('Unable to read control room data', error);
    return Response.json({ error: 'Unable to read control room data' }, { status: 502, headers: noStoreHeaders });
  }
}

async function readControlRoom(eventId: string) {
  const eventPrefix = `cvar:event:${eventId}`;
  const [snapshotValue, registrationValues, sessionValues] = await Promise.all([
    redisCommand(['GET', 'cvar:live']),
    redisCommand(['HVALS', `${eventPrefix}:registrations`]),
    redisCommand(['ZRANGE', `${eventPrefix}:sessions`, -100, -1, 'WITHSCORES']),
  ]);
  const sessionPairs = Array.isArray(sessionValues) ? sessionValues.map(String) : [];
  const sessions = [];
  for (let index = 0; index < sessionPairs.length; index += 2) {
    const id = sessionPairs[index];
    const [latestValue, passingCount, rawRecordCount] = await Promise.all([
      redisCommand(['GET', `${eventPrefix}:session:${id}:latest`]),
      redisCommand(['ZCARD', `${eventPrefix}:session:${id}:passing-order`]),
      redisCommand(['ZCARD', `${eventPrefix}:session:${id}:raw-record-order`]),
    ]);
    const latest = typeof latestValue === 'string' ? JSON.parse(latestValue) as { runId?: string; runName?: string; flag?: string } : null;
    sessions.push({
      id,
      startedAt: new Date(Number(sessionPairs[index + 1])).toISOString(),
      runId: latest?.runId || '',
      runName: latest?.runName || id,
      flag: latest?.flag || '',
      passingCount: Number(passingCount) || 0,
      rawRecordCount: Number(rawRecordCount) || 0,
    });
  }
  return Response.json({
    eventId,
    snapshot: typeof snapshotValue === 'string' ? JSON.parse(snapshotValue) : null,
    registrations: parseJsonValues(registrationValues),
    sessions: sessions.reverse(),
  }, { headers: noStoreHeaders });
}

async function readSession(eventId: string, sessionId: string, url: URL) {
  const prefix = `cvar:event:${eventId}:session:${sessionId}`;
  const offset = boundedInteger(url.searchParams.get('offset'), 0, 1_000_000, 0);
  const limit = boundedInteger(url.searchParams.get('limit'), 1, 500, 200);
  const includeRaw = url.searchParams.get('raw') === '1';
  const [snapshotValue, passingIds, rawRecordCount, rawRecordIds] = await Promise.all([
    redisCommand(['GET', `${prefix}:latest`]),
    redisCommand(['ZRANGE', `${prefix}:passing-order`, 0, -1]),
    redisCommand(['ZCARD', `${prefix}:raw-record-order`]),
    includeRaw ? redisCommand(['ZRANGE', `${prefix}:raw-record-order`, offset, offset + limit - 1]) : Promise.resolve([]),
  ]);
  const ids = Array.isArray(passingIds) ? passingIds.map(String) : [];
  const rawIds = Array.isArray(rawRecordIds) ? rawRecordIds.map(String) : [];
  const [passingValues, rawRecordValues] = await Promise.all([
    ids.length ? redisCommand(['HMGET', `${prefix}:passings`, ...ids]) : Promise.resolve([]),
    rawIds.length ? redisCommand(['HMGET', `${prefix}:raw-records`, ...rawIds]) : Promise.resolve([]),
  ]);
  return Response.json({
    eventId,
    sessionId,
    snapshot: typeof snapshotValue === 'string' ? JSON.parse(snapshotValue) : null,
    passings: parseJsonValues(passingValues),
    rawRecordCount: Number(rawRecordCount) || 0,
    ...(includeRaw ? { rawRecords: parseJsonValues(rawRecordValues), rawOffset: offset, rawLimit: limit } : {}),
  }, { headers: noStoreHeaders });
}

function parseJsonValues(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== 'string') return [];
    try { return [JSON.parse(item)]; } catch { return []; }
  });
}

function safeId(value: string) {
  return /^[a-z0-9][a-z0-9-]{0,119}$/i.test(value);
}

function boundedInteger(value: string | null, minimum: number, maximum: number, fallback: number) {
  const number = Number(value);
  return Number.isInteger(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

const noStoreHeaders = { 'cache-control': 'private, no-store, max-age=0' };
