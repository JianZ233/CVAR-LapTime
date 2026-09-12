import { redisCommand, redisIsConfigured } from './_redis.js';
import {
  hydrateRacePositions,
  parseRacePositionHash,
} from './_race_positions.js';

export function GET() {
  if (!redisIsConfigured()) {
    return Response.json(
      { error: 'Live timing storage is not configured' },
      { status: 503, headers: noStoreHeaders },
    );
  }
  return readSnapshot();
}

async function readSnapshot() {
  try {
    const [stored, sessionId] = await Promise.all([
      redisCommand(['GET', 'cvar:live']),
      redisCommand(['GET', 'cvar:live-session']),
    ]);
    if (typeof stored !== 'string')
      return Response.json(
        { error: 'No live session is available' },
        { status: 404, headers: noStoreHeaders },
      );
    const storedPositions =
      typeof sessionId === 'string'
        ? await redisCommand([
            'HGETALL',
            `cvar:event:canyon-classic-2026:session:${sessionId}:race-positions`,
          ])
        : [];
    return Response.json(
      {
        snapshot: hydrateRacePositions(
          JSON.parse(stored),
          parseRacePositionHash(storedPositions),
        ),
      },
      { headers: liveHeaders },
    );
  } catch (error) {
    console.error('Unable to read live timing', error);
    return Response.json(
      { error: 'Unable to read live timing' },
      { status: 502, headers: noStoreHeaders },
    );
  }
}

const noStoreHeaders = { 'cache-control': 'no-store, max-age=0' };
const liveHeaders = {
  'cache-control': 'public, max-age=0, must-revalidate',
  'vercel-cdn-cache-control': 'public, s-maxage=1, stale-while-revalidate=1',
};
