import { redisCommand, redisIsConfigured } from './_redis.js';

export function GET() {
  if (!redisIsConfigured()) {
    return Response.json({ error: 'Live timing storage is not configured' }, { status: 503, headers: noStoreHeaders });
  }
  return readSnapshot();
}

async function readSnapshot() {
  try {
    const stored = await redisCommand(['GET', 'cvar:live']);
    if (typeof stored !== 'string') return Response.json({ error: 'No live session is available' }, { status: 404, headers: noStoreHeaders });
    return Response.json({ snapshot: JSON.parse(stored) }, { headers: noStoreHeaders });
  } catch (error) {
    console.error('Unable to read live timing', error);
    return Response.json({ error: 'Unable to read live timing' }, { status: 502, headers: noStoreHeaders });
  }
}

const noStoreHeaders = { 'cache-control': 'no-store, max-age=0' };
