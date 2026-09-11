import { timingSafeEqual } from 'node:crypto';

import { redisCommand, redisIsConfigured } from './_redis.js';

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!redisIsConfigured()) return Response.json({ error: 'Timing storage is not configured' }, { status: 503 });

  const url = new URL(request.url);
  const eventId = url.searchParams.get('event') || 'canyon-classic-2026';
  const sessionId = url.searchParams.get('session');
  if (!safeId(eventId) || (sessionId && !safeId(sessionId))) return Response.json({ error: 'Invalid event or session identifier' }, { status: 400 });

  try {
    if (!sessionId) return listEvent(eventId);
    return readSession(eventId, sessionId);
  } catch (error) {
    console.error('Unable to read timing archive', error);
    return Response.json({ error: 'Unable to read timing archive' }, { status: 502 });
  }
}

async function listEvent(eventId: string) {
  const [sessionValues, registrationValues] = await Promise.all([
    redisCommand(['ZRANGE', `cvar:event:${eventId}:sessions`, 0, -1, 'WITHSCORES']),
    redisCommand(['HVALS', `cvar:event:${eventId}:registrations`]),
  ]);
  const values = Array.isArray(sessionValues) ? sessionValues.map(String) : [];
  const sessions = [];
  for (let index = 0; index < values.length; index += 2) sessions.push({ id: values[index], startedAt: new Date(Number(values[index + 1])).toISOString() });
  return Response.json({ eventId, sessions, registrations: parseJsonValues(registrationValues) }, { headers: noStoreHeaders });
}

async function readSession(eventId: string, sessionId: string) {
  const prefix = `cvar:event:${eventId}:session:${sessionId}`;
  const [snapshotValue, passingIds] = await Promise.all([
    redisCommand(['GET', `${prefix}:latest`]),
    redisCommand(['ZRANGE', `${prefix}:passing-order`, 0, -1]),
  ]);
  const ids = Array.isArray(passingIds) ? passingIds.map(String) : [];
  const passingValues = ids.length ? await redisCommand(['HMGET', `${prefix}:passings`, ...ids]) : [];
  return Response.json({
    eventId,
    sessionId,
    snapshot: typeof snapshotValue === 'string' ? JSON.parse(snapshotValue) : null,
    passings: parseJsonValues(passingValues),
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

function authorized(request: Request) {
  const expected = process.env.CVAR_INGEST_SECRET;
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!expected) return false;
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

const noStoreHeaders = { 'cache-control': 'private, no-store, max-age=0' };
