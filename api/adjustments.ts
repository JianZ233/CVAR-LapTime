import { adminRequestIsAuthorized } from './_admin-auth.js';
import {
  adjustmentKey,
  readAdjustments,
  type ResultAdjustment,
  type ResultStatus,
} from './_adjustments.js';
import { redisCommand, redisIsConfigured, redisPipeline } from './_redis.js';

const defaultEventId = 'canyon-classic-2026';

export async function GET(request: Request) {
  if (!adminRequestIsAuthorized(request))
    return Response.json(
      { error: 'Unauthorized' },
      { status: 401, headers: noStoreHeaders },
    );
  if (!redisIsConfigured())
    return Response.json(
      { error: 'Timing storage is not configured' },
      { status: 503, headers: noStoreHeaders },
    );
  const url = new URL(request.url);
  const eventId = url.searchParams.get('event') || defaultEventId;
  const sessionId = url.searchParams.get('session') || '';
  if (!safeId(eventId) || !safeId(sessionId))
    return Response.json(
      { error: 'Invalid event or session identifier' },
      { status: 400, headers: noStoreHeaders },
    );

  try {
    const [snapshotValue, adjustments] = await Promise.all([
      redisCommand([
        'GET',
        `cvar:event:${eventId}:session:${sessionId}:latest`,
      ]),
      readAdjustments(eventId, sessionId),
    ]);
    if (typeof snapshotValue !== 'string')
      return Response.json(
        { error: 'Session not found' },
        { status: 404, headers: noStoreHeaders },
      );
    const snapshot = JSON.parse(snapshotValue) as {
      runName?: unknown;
      flag?: unknown;
      updatedAt?: unknown;
      cars?: unknown;
    };
    return Response.json(
      {
        eventId,
        sessionId,
        snapshot: {
          runName:
            typeof snapshot.runName === 'string' ? snapshot.runName : sessionId,
          flag: typeof snapshot.flag === 'string' ? snapshot.flag : '',
          updatedAt:
            typeof snapshot.updatedAt === 'string' ? snapshot.updatedAt : '',
          cars: Array.isArray(snapshot.cars)
            ? snapshot.cars.map(sanitizeCar).filter(Boolean)
            : [],
        },
        adjustments,
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    console.error('Unable to read result adjustments', error);
    return Response.json(
      { error: 'Unable to read result adjustments' },
      { status: 502, headers: noStoreHeaders },
    );
  }
}

export async function POST(request: Request) {
  if (!adminRequestIsAuthorized(request))
    return Response.json(
      { error: 'Unauthorized' },
      { status: 401, headers: noStoreHeaders },
    );
  if (!sameOrigin(request))
    return Response.json(
      { error: 'Invalid request origin' },
      { status: 403, headers: noStoreHeaders },
    );
  if (!redisIsConfigured())
    return Response.json(
      { error: 'Timing storage is not configured' },
      { status: 503, headers: noStoreHeaders },
    );

  try {
    const raw = await request.text();
    if (raw.length > 16_384)
      return Response.json(
        { error: 'Adjustment request is too large' },
        { status: 413, headers: noStoreHeaders },
      );
    const body = JSON.parse(raw) as Record<string, unknown>;
    const eventId =
      typeof body.eventId === 'string' ? body.eventId : defaultEventId;
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
    const registrationKey =
      typeof body.registrationKey === 'string' ? body.registrationKey : '';
    if (
      !safeId(eventId) ||
      !safeId(sessionId) ||
      !safeRegistrationKey(registrationKey)
    ) {
      return Response.json(
        { error: 'Invalid adjustment target' },
        { status: 400, headers: noStoreHeaders },
      );
    }

    const snapshotValue = await redisCommand([
      'GET',
      `cvar:event:${eventId}:session:${sessionId}:latest`,
    ]);
    if (typeof snapshotValue !== 'string')
      return Response.json(
        { error: 'Session not found' },
        { status: 404, headers: noStoreHeaders },
      );
    const snapshot = JSON.parse(snapshotValue) as { cars?: unknown };
    const cars = Array.isArray(snapshot.cars) ? snapshot.cars : [];
    const target = cars.find(
      (value) =>
        value &&
        typeof value === 'object' &&
        carKey(value as Record<string, unknown>) === registrationKey,
    ) as Record<string, unknown> | undefined;
    if (!target)
      return Response.json(
        { error: 'Driver is not part of this session' },
        { status: 404, headers: noStoreHeaders },
      );

    const clear = body.clear === true;
    const adjustment = clear ? null : normalizeAdjustment(body);
    if (!clear && !adjustment)
      return Response.json(
        { error: 'Invalid adjustment values' },
        { status: 400, headers: noStoreHeaders },
      );
    const key = adjustmentKey(eventId, sessionId);
    const updatedAt = new Date().toISOString();
    const saved = adjustment ? { ...adjustment, updatedAt } : null;
    const audit = JSON.stringify({
      registrationKey,
      number: typeof target.number === 'string' ? target.number : '',
      driver: typeof target.driver === 'string' ? target.driver : '',
      adjustment: saved,
      action: saved ? 'saved' : 'cleared',
      updatedAt,
    });
    await redisPipeline([
      saved
        ? ['HSET', key, registrationKey, JSON.stringify(saved)]
        : ['HDEL', key, registrationKey],
      ['LPUSH', `${key}:audit`, audit],
      ['LTRIM', `${key}:audit`, 0, 199],
    ]);
    return Response.json(
      { ok: true, registrationKey, adjustment: saved },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    console.error('Unable to save result adjustment', error);
    return Response.json(
      { error: 'Unable to save result adjustment' },
      { status: 502, headers: noStoreHeaders },
    );
  }
}

function normalizeAdjustment(
  body: Record<string, unknown>,
): Omit<ResultAdjustment, 'updatedAt'> | null {
  const penaltySeconds =
    typeof body.penaltySeconds === 'number'
      ? body.penaltySeconds
      : Number(body.penaltySeconds || 0);
  const positionValue =
    body.positionOverride === '' || body.positionOverride == null
      ? null
      : Number(body.positionOverride);
  const status =
    typeof body.status === 'string' ? body.status.toUpperCase() : '';
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (
    !Number.isFinite(penaltySeconds) ||
    penaltySeconds < 0 ||
    penaltySeconds > 86_400
  )
    return null;
  if (
    positionValue !== null &&
    (!Number.isInteger(positionValue) ||
      positionValue < 1 ||
      positionValue > 500)
  )
    return null;
  if (
    !['', 'PENALTY', 'DNF', 'DNS', 'DQ'].includes(status) ||
    note.length > 240
  )
    return null;
  return {
    penaltySeconds: Math.round(penaltySeconds * 1_000) / 1_000,
    positionOverride: positionValue,
    status: status as ResultStatus,
    note,
  };
}

function sanitizeCar(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const car = value as Record<string, unknown>;
  return {
    registrationKey: carKey(car),
    registrationNumber: stringValue(car.registrationNumber),
    number: stringValue(car.number),
    driver: stringValue(car.driver),
    className: stringValue(car.className),
    groupName: stringValue(car.groupName),
    position: numberValue(car.position),
    laps: numberValue(car.laps),
    totalTime: stringValue(car.totalTime),
    bestLap: stringValue(car.bestLap),
  };
}

function carKey(car: Record<string, unknown>) {
  return (
    stringValue(car.registrationKey) || stringValue(car.registrationNumber)
  );
}
function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}
function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
function safeId(value: string) {
  return /^[a-z0-9][a-z0-9-]{0,119}$/i.test(value);
}
function safeRegistrationKey(value: string) {
  return (
    value.length > 0 &&
    value.length <= 120 &&
    !Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  );
}
function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}

const noStoreHeaders = { 'cache-control': 'private, no-store, max-age=0' };
