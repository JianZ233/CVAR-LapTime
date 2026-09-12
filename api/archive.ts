import { timingSafeEqual } from 'node:crypto';

import { redisCommand, redisIsConfigured, redisPipeline } from './_redis.js';

export async function GET(request: Request) {
  if (!authorized(request))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!redisIsConfigured())
    return Response.json(
      { error: 'Timing storage is not configured' },
      { status: 503 },
    );

  const url = new URL(request.url);
  const eventId = url.searchParams.get('event') || 'canyon-classic-2026';
  const sessionId = url.searchParams.get('session');
  if (!safeId(eventId) || (sessionId && !safeId(sessionId)))
    return Response.json(
      { error: 'Invalid event or session identifier' },
      { status: 400 },
    );

  try {
    if (!sessionId) return await listEvent(eventId);
    return await readSession(eventId, sessionId, {
      includeRaw: url.searchParams.get('raw') === '1',
      offset: boundedInteger(url.searchParams.get('offset'), 0, 1_000_000, 0),
      limit: boundedInteger(url.searchParams.get('limit'), 1, 500, 200),
    });
  } catch (error) {
    console.error('Unable to read timing archive', error);
    return Response.json(
      { error: 'Unable to read timing archive' },
      { status: 502 },
    );
  }
}

export async function DELETE(request: Request) {
  if (!authorized(request))
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
  const eventId = url.searchParams.get('event') || 'canyon-classic-2026';
  const sessionIds = [...new Set(url.searchParams.getAll('session'))];
  if (
    !safeId(eventId) ||
    sessionIds.length === 0 ||
    sessionIds.length > 20 ||
    sessionIds.some((sessionId) => !safeId(sessionId))
  )
    return Response.json(
      { error: 'Invalid event or session identifier' },
      { status: 400, headers: noStoreHeaders },
    );

  try {
    const liveSessionId = await redisCommand(['GET', 'cvar:live-session']);
    if (typeof liveSessionId === 'string' && sessionIds.includes(liveSessionId))
      return Response.json(
        { error: 'The live session cannot be removed from Results' },
        { status: 409, headers: noStoreHeaders },
      );

    const eventPrefix = `cvar:event:${eventId}`;
    const results = (await redisPipeline([
      ['ZREM', `${eventPrefix}:sessions`, ...sessionIds],
      ['HDEL', `${eventPrefix}:session-summaries`, ...sessionIds],
    ])) as Array<{ result?: unknown }>;
    return Response.json(
      {
        eventId,
        sessionIds,
        removedFromResults: Number(results[0]?.result) || 0,
        removedSummaries: Number(results[1]?.result) || 0,
        archivePreserved: true,
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    console.error('Unable to remove timing results', error);
    return Response.json(
      { error: 'Unable to remove timing results' },
      { status: 502, headers: noStoreHeaders },
    );
  }
}

async function listEvent(eventId: string) {
  const [sessionValues, registrationValues] = await Promise.all([
    redisCommand([
      'ZRANGE',
      `cvar:event:${eventId}:sessions`,
      0,
      -1,
      'WITHSCORES',
    ]),
    redisCommand(['HVALS', `cvar:event:${eventId}:registrations`]),
  ]);
  const values = Array.isArray(sessionValues) ? sessionValues.map(String) : [];
  const sessions = [];
  for (let index = 0; index < values.length; index += 2)
    sessions.push({
      id: values[index],
      startedAt: new Date(Number(values[index + 1])).toISOString(),
    });
  return Response.json(
    { eventId, sessions, registrations: parseJsonValues(registrationValues) },
    { headers: noStoreHeaders },
  );
}

async function readSession(
  eventId: string,
  sessionId: string,
  rawOptions: { includeRaw: boolean; offset: number; limit: number },
) {
  const prefix = `cvar:event:${eventId}:session:${sessionId}`;
  const [snapshotValue, passingIds, rawRecordCount, rawRecordIds] =
    await Promise.all([
      redisCommand(['GET', `${prefix}:latest`]),
      redisCommand(['ZRANGE', `${prefix}:passing-order`, 0, -1]),
      redisCommand(['ZCARD', `${prefix}:raw-record-order`]),
      rawOptions.includeRaw
        ? redisCommand([
            'ZRANGE',
            `${prefix}:raw-record-order`,
            rawOptions.offset,
            rawOptions.offset + rawOptions.limit - 1,
          ])
        : Promise.resolve([]),
    ]);
  const ids = Array.isArray(passingIds) ? passingIds.map(String) : [];
  const rawIds = Array.isArray(rawRecordIds) ? rawRecordIds.map(String) : [];
  const passingValues = ids.length
    ? await redisCommand(['HMGET', `${prefix}:passings`, ...ids])
    : [];
  const rawRecordValues = rawIds.length
    ? await redisCommand(['HMGET', `${prefix}:raw-records`, ...rawIds])
    : [];
  return Response.json(
    {
      eventId,
      sessionId,
      snapshot:
        typeof snapshotValue === 'string' ? JSON.parse(snapshotValue) : null,
      passings: parseJsonValues(passingValues),
      rawRecordCount: Number(rawRecordCount) || 0,
      ...(rawOptions.includeRaw
        ? {
            rawRecords: parseJsonValues(rawRecordValues),
            rawOffset: rawOptions.offset,
            rawLimit: rawOptions.limit,
          }
        : {}),
    },
    { headers: noStoreHeaders },
  );
}

function parseJsonValues(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== 'string') return [];
    try {
      return [JSON.parse(item)];
    } catch {
      return [];
    }
  });
}

function safeId(value: string) {
  return /^[a-z0-9][a-z0-9-]{0,119}$/i.test(value);
}

function boundedInteger(
  value: string | null,
  minimum: number,
  maximum: number,
  fallback: number,
) {
  const number = Number(value);
  return Number.isInteger(number)
    ? Math.min(maximum, Math.max(minimum, number))
    : fallback;
}

function authorized(request: Request) {
  const expected = process.env.CVAR_INGEST_SECRET;
  const supplied =
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!expected) return false;
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

const noStoreHeaders = { 'cache-control': 'private, no-store, max-age=0' };
