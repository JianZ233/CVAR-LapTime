import { timingSafeEqual } from 'node:crypto';

import { redisCommand, redisIsConfigured, redisPipeline } from './_redis';

type TimingSnapshotInput = {
  eventName: string;
  trackName: string;
  runName: string;
  updatedAt: string;
  cars: unknown[];
};

type PassingInput = {
  id: string;
  registrationNumber: string;
  recordedAt: string;
};

type RegistrationInput = {
  registrationNumber: string;
};

type IngestEnvelope = {
  eventId: string;
  sessionId: string;
  sessionStartedAt: string;
  sessionChanged: boolean;
  snapshot: TimingSnapshotInput;
  passings: PassingInput[];
  registrations: RegistrationInput[];
};

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!redisIsConfigured()) return Response.json({ error: 'Live timing storage is not configured' }, { status: 503 });

  if (new URL(request.url).searchParams.get('check') === '1') return checkStorage();

  const raw = await request.text();
  if (raw.length > 512_000) return Response.json({ error: 'Snapshot is too large' }, { status: 413 });

  try {
    const value = JSON.parse(raw) as unknown;
    const envelope = normalizeEnvelope(value);
    if (!envelope) return Response.json({ error: 'Invalid timing payload' }, { status: 400 });
    await storeEnvelope(envelope);
    return Response.json({ ok: true, cars: envelope.snapshot.cars.length, passings: envelope.passings.length }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    console.error('Unable to ingest live timing', error);
    return Response.json({ error: 'Unable to store timing data' }, { status: 502 });
  }
}

async function checkStorage() {
  try {
    await redisCommand(['PING']);
    return Response.json({ ok: true, ingest: 'ready', storage: 'ready' }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    console.error('Live timing preflight failed', error);
    return Response.json({ error: 'Live timing storage is unavailable' }, { status: 502 });
  }
}

async function storeEnvelope(envelope: IngestEnvelope) {
  const eventPrefix = `cvar:event:${envelope.eventId}`;
  const sessionPrefix = `${eventPrefix}:session:${envelope.sessionId}`;
  const timestamp = Date.parse(envelope.snapshot.updatedAt) || Date.now();
  const commands: Array<Array<string | number>> = [
    ['SET', 'cvar:live', JSON.stringify(envelope.snapshot)],
    ['SET', `${sessionPrefix}:latest`, JSON.stringify(envelope.snapshot)],
  ];

  if (envelope.sessionChanged) {
    commands.push(
      ['SADD', 'cvar:events', envelope.eventId],
      ['ZADD', `${eventPrefix}:sessions`, Date.parse(envelope.sessionStartedAt) || timestamp, envelope.sessionId],
      ['HSET', `${eventPrefix}:meta`, 'eventName', envelope.snapshot.eventName, 'trackName', envelope.snapshot.trackName, 'updatedAt', envelope.snapshot.updatedAt],
    );
  }

  if (envelope.registrations.length) {
    commands.push(['HSET', `${eventPrefix}:registrations`, ...envelope.registrations.flatMap((registration) => [registration.registrationNumber, JSON.stringify(registration)])]);
  }

  if (envelope.passings.length) {
    commands.push(
      ['HSET', `${sessionPrefix}:passings`, ...envelope.passings.flatMap((passing) => [passing.id, JSON.stringify(passing)])],
      ['ZADD', `${sessionPrefix}:passing-order`, ...envelope.passings.flatMap((passing) => [Date.parse(passing.recordedAt) || timestamp, passing.id])],
    );
  }

  await redisPipeline(commands);
}

function normalizeEnvelope(value: unknown): IngestEnvelope | null {
  if (isSnapshotShape(value)) {
    const sessionId = `legacy-${slug(value.runName)}`;
    return { eventId: 'canyon-classic-2026', sessionId, sessionStartedAt: value.updatedAt, sessionChanged: true, snapshot: value, passings: [], registrations: [] };
  }
  if (!value || typeof value !== 'object') return null;
  const envelope = value as Partial<IngestEnvelope>;
  if (!safeId(envelope.eventId) || !safeId(envelope.sessionId) || typeof envelope.sessionStartedAt !== 'string' || typeof envelope.sessionChanged !== 'boolean' || !isSnapshotShape(envelope.snapshot)) return null;
  if (!Array.isArray(envelope.passings) || envelope.passings.length > 500 || !envelope.passings.every(isPassingShape)) return null;
  if (!Array.isArray(envelope.registrations) || envelope.registrations.length > 500 || !envelope.registrations.every(isRegistrationShape)) return null;
  return envelope as IngestEnvelope;
}

function isSnapshotShape(value: unknown): value is TimingSnapshotInput {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<TimingSnapshotInput>;
  return typeof snapshot.eventName === 'string' && snapshot.eventName.length <= 200 && typeof snapshot.trackName === 'string' && snapshot.trackName.length <= 200 && typeof snapshot.runName === 'string' && snapshot.runName.length <= 200 && typeof snapshot.updatedAt === 'string' && Array.isArray(snapshot.cars) && snapshot.cars.length <= 500;
}

function isPassingShape(value: unknown): value is PassingInput {
  if (!value || typeof value !== 'object') return false;
  const passing = value as Partial<PassingInput>;
  return typeof passing.id === 'string' && passing.id.length <= 240 && typeof passing.registrationNumber === 'string' && passing.registrationNumber.length <= 100 && typeof passing.recordedAt === 'string';
}

function isRegistrationShape(value: unknown): value is RegistrationInput {
  if (!value || typeof value !== 'object') return false;
  const registration = value as Partial<RegistrationInput>;
  return typeof registration.registrationNumber === 'string' && registration.registrationNumber.length > 0 && registration.registrationNumber.length <= 100;
}

function safeId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,119}$/i.test(value);
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'session';
}

function authorized(request: Request) {
  const expected = process.env.CVAR_INGEST_SECRET;
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? request.headers.get('x-ingest-key') ?? '';
  if (!expected) return false;
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
