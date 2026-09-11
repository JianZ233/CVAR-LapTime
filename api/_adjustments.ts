import { redisCommand } from './_redis.js';

export type ResultStatus = '' | 'PENALTY' | 'DNF' | 'DNS' | 'DQ';

export type ResultAdjustment = {
  penaltySeconds: number;
  positionOverride: number | null;
  status: ResultStatus;
  note: string;
  updatedAt: string;
};

export async function readAdjustments(eventId: string, sessionId: string) {
  const stored = await redisCommand([
    'HGETALL',
    adjustmentKey(eventId, sessionId),
  ]);
  return parseAdjustmentHash(stored);
}

export function adjustmentKey(eventId: string, sessionId: string) {
  return `cvar:event:${eventId}:session:${sessionId}:adjustments`;
}

export function parseAdjustmentHash(value: unknown) {
  const entries: Array<[string, unknown]> = [];
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 2)
      entries.push([String(value[index]), value[index + 1]]);
  } else if (value && typeof value === 'object') {
    entries.push(...Object.entries(value as Record<string, unknown>));
  }

  const adjustments: Record<string, ResultAdjustment> = {};
  for (const [registrationKey, raw] of entries) {
    const parsed = parseAdjustment(raw);
    if (parsed) adjustments[registrationKey] = parsed;
  }
  return adjustments;
}

function parseAdjustment(value: unknown): ResultAdjustment | null {
  if (typeof value !== 'string') return null;
  try {
    const adjustment = JSON.parse(value) as Record<string, unknown>;
    const status =
      typeof adjustment.status === 'string' &&
      ['', 'PENALTY', 'DNF', 'DNS', 'DQ'].includes(adjustment.status)
        ? (adjustment.status as ResultStatus)
        : '';
    return {
      penaltySeconds: finiteNumber(adjustment.penaltySeconds, 0),
      positionOverride: positiveInteger(adjustment.positionOverride),
      status,
      note:
        typeof adjustment.note === 'string'
          ? adjustment.note.slice(0, 240)
          : '',
      updatedAt:
        typeof adjustment.updatedAt === 'string' ? adjustment.updatedAt : '',
    };
  } catch {
    return null;
  }
}

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function positiveInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : null;
}
