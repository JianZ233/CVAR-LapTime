import { timingSafeEqual } from 'node:crypto';

import { redisCommand, redisIsConfigured } from './_redis';

export async function POST(request: Request) {
  const expected = process.env.CVAR_INGEST_SECRET;
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? request.headers.get('x-ingest-key') ?? '';

  if (!expected || !safeEqual(supplied, expected)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!redisIsConfigured()) return Response.json({ error: 'Live timing storage is not configured' }, { status: 503 });

  if (new URL(request.url).searchParams.get('check') === '1') {
    try {
      await redisCommand(['PING']);
      return Response.json({ ok: true, ingest: 'ready', storage: 'ready' }, { headers: { 'cache-control': 'no-store' } });
    } catch (error) {
      console.error('Live timing preflight failed', error);
      return Response.json({ error: 'Live timing storage is unavailable' }, { status: 502 });
    }
  }

  const raw = await request.text();
  if (raw.length > 512_000) return Response.json({ error: 'Snapshot is too large' }, { status: 413 });

  try {
    const snapshot = JSON.parse(raw) as { eventName?: unknown; trackName?: unknown; runName?: unknown; updatedAt?: unknown; cars?: unknown };
    if (!isSnapshotShape(snapshot)) return Response.json({ error: 'Invalid timing snapshot' }, { status: 400 });
    await redisCommand(['SET', 'cvar:live', JSON.stringify(snapshot), 'EX', 21600]);
    return Response.json({ ok: true, cars: snapshot.cars.length }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    console.error('Unable to ingest live timing', error);
    return Response.json({ error: 'Unable to store timing snapshot' }, { status: 502 });
  }
}

function isSnapshotShape(value: { eventName?: unknown; trackName?: unknown; runName?: unknown; updatedAt?: unknown; cars?: unknown }): value is { eventName: string; trackName: string; runName: string; updatedAt: string; cars: unknown[] } {
  return typeof value.eventName === 'string' && value.eventName.length <= 200 && typeof value.trackName === 'string' && value.trackName.length <= 200 && typeof value.runName === 'string' && value.runName.length <= 200 && typeof value.updatedAt === 'string' && Array.isArray(value.cars) && value.cars.length <= 500;
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
