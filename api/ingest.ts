import { timingSafeEqual } from 'node:crypto';

import { redisCommand, redisIsConfigured, redisPipeline } from './_redis.js';

type TimingSnapshotInput = {
  eventName: string;
  trackName: string;
  runId?: string;
  runName: string;
  flag?: string;
  flagStartedAt?: string;
  initializedAt?: string;
  groups?: unknown[];
  updatedAt: string;
  cars: unknown[];
};

type FlagState = {
  flag: string;
  startedAt: string;
};

type PassingInput = {
  id: string;
  registrationNumber: string;
  recordedAt: string;
};

type RegistrationInput = {
  registrationKey?: string;
  registrationNumber: string;
};

type RawRecordInput = {
  id: string;
  command: string;
  fields: string[];
  line: string;
  observedAt: string;
};

type IngestEnvelope = {
  eventId: string;
  sessionId: string;
  sessionStartedAt: string;
  sessionChanged: boolean;
  snapshot: TimingSnapshotInput;
  passings: PassingInput[];
  rawRecords: RawRecordInput[];
  registrations: RegistrationInput[];
};

export async function POST(request: Request) {
  if (!authorized(request))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!redisIsConfigured())
    return Response.json(
      { error: 'Live timing storage is not configured' },
      { status: 503 },
    );

  if (new URL(request.url).searchParams.get('check') === '1')
    return checkStorage();

  const raw = await request.text();
  if (raw.length > 512_000)
    return Response.json({ error: 'Snapshot is too large' }, { status: 413 });

  try {
    const value = JSON.parse(raw) as unknown;
    const envelope = normalizeEnvelope(value);
    if (!envelope)
      return Response.json(
        { error: 'Invalid timing payload' },
        { status: 400 },
      );
    await storeEnvelope(envelope);
    return Response.json(
      {
        ok: true,
        cars: envelope.snapshot.cars.length,
        passings: envelope.passings.length,
        rawRecords: envelope.rawRecords.length,
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    console.error('Unable to ingest live timing', error);
    return Response.json(
      { error: 'Unable to store timing data' },
      { status: 502 },
    );
  }
}

async function checkStorage() {
  try {
    await redisCommand(['PING']);
    return Response.json(
      { ok: true, ingest: 'ready', storage: 'ready' },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    console.error('Live timing preflight failed', error);
    return Response.json(
      { error: 'Live timing storage is unavailable' },
      { status: 502 },
    );
  }
}

async function storeEnvelope(envelope: IngestEnvelope) {
  const eventPrefix = `cvar:event:${envelope.eventId}`;
  const sessionPrefix = `${eventPrefix}:session:${envelope.sessionId}`;
  const timestamp = Date.parse(envelope.snapshot.updatedAt) || Date.now();
  const hasCars = envelope.snapshot.cars.length > 0;
  const flag = normalizeFlag(envelope.snapshot.flag);
  const previousFlagState = parseFlagState(
    await redisCommand(['GET', `${sessionPrefix}:flag-current`]),
  );
  const flagChanged = previousFlagState?.flag !== flag;
  const flagStartedAt = flagChanged
    ? validTimestamp(envelope.snapshot.updatedAt, timestamp)
    : previousFlagState?.startedAt ||
      validTimestamp(envelope.snapshot.updatedAt, timestamp);
  const flagState: FlagState = { flag, startedAt: flagStartedAt };
  const storedSnapshot = {
    ...envelope.snapshot,
    flag,
    flagStartedAt,
  };
  const commands: Array<Array<string | number>> = [
    ['SET', 'cvar:live', JSON.stringify(storedSnapshot)],
    ['SET', 'cvar:live-session', envelope.sessionId],
    ['SET', `${sessionPrefix}:flag-current`, JSON.stringify(flagState)],
  ];

  // Keep empty scoreboard frames live, but do not turn them into downloadable
  // results or replace the last populated classification for a session.
  if (hasCars) {
    commands.push(
      ['SET', `${sessionPrefix}:latest`, JSON.stringify(storedSnapshot)],
      [
        'HSET',
        `${eventPrefix}:session-summaries`,
        envelope.sessionId,
        JSON.stringify({
          runId: envelope.snapshot.runId || '',
          runName: envelope.snapshot.runName,
          flag,
          groups: Array.isArray(envelope.snapshot.groups)
            ? envelope.snapshot.groups.filter(
                (group): group is string => typeof group === 'string',
              )
            : [],
          carCount: envelope.snapshot.cars.length,
          updatedAt: envelope.snapshot.updatedAt,
        }),
      ],
      ['SADD', 'cvar:events', envelope.eventId],
      [
        'ZADD',
        `${eventPrefix}:sessions`,
        Date.parse(envelope.sessionStartedAt) || timestamp,
        envelope.sessionId,
      ],
      [
        'HSET',
        `${eventPrefix}:meta`,
        'eventName',
        envelope.snapshot.eventName,
        'trackName',
        envelope.snapshot.trackName,
        'updatedAt',
        envelope.snapshot.updatedAt,
      ],
    );
  }

  if (flagChanged) {
    commands.push([
      'ZADD',
      `${sessionPrefix}:flag-history`,
      Date.parse(flagStartedAt) || timestamp,
      JSON.stringify(flagState),
    ]);
  }

  if (envelope.registrations.length) {
    commands.push([
      'HSET',
      `${eventPrefix}:registrations`,
      ...envelope.registrations.flatMap((registration) => [
        registration.registrationKey || registration.registrationNumber,
        JSON.stringify(registration),
      ]),
    ]);
  }

  if (envelope.passings.length) {
    commands.push(
      [
        'HSET',
        `${sessionPrefix}:passings`,
        ...envelope.passings.flatMap((passing) => [
          passing.id,
          JSON.stringify(passing),
        ]),
      ],
      [
        'ZADD',
        `${sessionPrefix}:passing-order`,
        ...envelope.passings.flatMap((passing) => [
          Date.parse(passing.recordedAt) || timestamp,
          passing.id,
        ]),
      ],
    );
  }

  if (envelope.rawRecords.length) {
    const racePositions = envelope.rawRecords.flatMap((record) => {
      if (record.command !== '$G') return [];
      const position = Number(record.fields[1]);
      const registrationNumber = record.fields[2];
      return Number.isInteger(position) && position > 0 && registrationNumber
        ? [registrationNumber, position]
        : [];
    });
    commands.push(
      [
        'HSET',
        `${sessionPrefix}:raw-records`,
        ...envelope.rawRecords.flatMap((record) => [
          record.id,
          JSON.stringify(record),
        ]),
      ],
      [
        'ZADD',
        `${sessionPrefix}:raw-record-order`,
        ...envelope.rawRecords.flatMap((record) => [
          Date.parse(record.observedAt) || timestamp,
          record.id,
        ]),
      ],
    );
    if (racePositions.length)
      commands.push([
        'HSET',
        `${sessionPrefix}:race-positions`,
        ...racePositions,
      ]);
  }

  await redisPipeline(commands);
}

function parseFlagState(value: unknown): FlagState | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value) as Partial<FlagState>;
    return typeof parsed.flag === 'string' &&
      typeof parsed.startedAt === 'string'
      ? { flag: normalizeFlag(parsed.flag), startedAt: parsed.startedAt }
      : null;
  } catch {
    return null;
  }
}

function normalizeFlag(value: unknown) {
  return typeof value === 'string' && value.trim()
    ? value.trim().toUpperCase()
    : 'NOT ACTIVE';
}

function validTimestamp(value: string, fallback: number) {
  return Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : new Date(fallback).toISOString();
}

function normalizeEnvelope(value: unknown): IngestEnvelope | null {
  if (isSnapshotShape(value)) {
    const sessionId = `legacy-${slug(value.runName)}`;
    return {
      eventId: 'canyon-classic-2026',
      sessionId,
      sessionStartedAt: value.updatedAt,
      sessionChanged: true,
      snapshot: value,
      passings: [],
      rawRecords: [],
      registrations: [],
    };
  }
  if (!value || typeof value !== 'object') return null;
  const envelope = value as Partial<IngestEnvelope>;
  if (
    !safeId(envelope.eventId) ||
    !safeId(envelope.sessionId) ||
    typeof envelope.sessionStartedAt !== 'string' ||
    typeof envelope.sessionChanged !== 'boolean' ||
    !isSnapshotShape(envelope.snapshot)
  )
    return null;
  if (
    !Array.isArray(envelope.passings) ||
    envelope.passings.length > 500 ||
    !envelope.passings.every(isPassingShape)
  )
    return null;
  const rawRecords = envelope.rawRecords ?? [];
  if (
    !Array.isArray(rawRecords) ||
    rawRecords.length > 2_000 ||
    !rawRecords.every(isRawRecordShape)
  )
    return null;
  if (
    !Array.isArray(envelope.registrations) ||
    envelope.registrations.length > 500 ||
    !envelope.registrations.every(isRegistrationShape)
  )
    return null;
  return { ...envelope, rawRecords } as IngestEnvelope;
}

function isSnapshotShape(value: unknown): value is TimingSnapshotInput {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<TimingSnapshotInput>;
  return (
    typeof snapshot.eventName === 'string' &&
    snapshot.eventName.length <= 200 &&
    typeof snapshot.trackName === 'string' &&
    snapshot.trackName.length <= 200 &&
    typeof snapshot.runName === 'string' &&
    snapshot.runName.length <= 200 &&
    typeof snapshot.updatedAt === 'string' &&
    Array.isArray(snapshot.cars) &&
    snapshot.cars.length <= 500
  );
}

function isPassingShape(value: unknown): value is PassingInput {
  if (!value || typeof value !== 'object') return false;
  const passing = value as Partial<PassingInput>;
  return (
    typeof passing.id === 'string' &&
    passing.id.length <= 240 &&
    typeof passing.registrationNumber === 'string' &&
    passing.registrationNumber.length <= 100 &&
    typeof passing.recordedAt === 'string'
  );
}

function isRegistrationShape(value: unknown): value is RegistrationInput {
  if (!value || typeof value !== 'object') return false;
  const registration = value as Partial<RegistrationInput>;
  return (
    typeof registration.registrationNumber === 'string' &&
    registration.registrationNumber.length > 0 &&
    registration.registrationNumber.length <= 100 &&
    (registration.registrationKey === undefined ||
      (typeof registration.registrationKey === 'string' &&
        registration.registrationKey.length > 0 &&
        registration.registrationKey.length <= 120))
  );
}

function isRawRecordShape(value: unknown): value is RawRecordInput {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<RawRecordInput>;
  return (
    typeof record.id === 'string' &&
    record.id.length <= 240 &&
    typeof record.command === 'string' &&
    record.command.length <= 24 &&
    typeof record.line === 'string' &&
    record.line.length <= 8_192 &&
    typeof record.observedAt === 'string' &&
    Array.isArray(record.fields) &&
    record.fields.length <= 100 &&
    record.fields.every(
      (field) => typeof field === 'string' && field.length <= 4_096,
    )
  );
}

function safeId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,119}$/i.test(value);
}

function slug(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'session'
  );
}

function authorized(request: Request) {
  const expected = process.env.CVAR_INGEST_SECRET;
  const supplied =
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    request.headers.get('x-ingest-key') ??
    '';
  if (!expected) return false;
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
