import { redisCommand, redisIsConfigured } from './_redis.js';
import {
  hydrateRacePositions,
  readRacePositions,
  snapshotUsesRacePositions,
} from './_race_positions.js';
import { CURRENT_EVENT_ID } from '../lib/events.js';

export function GET(request: Request) {
  if (!redisIsConfigured()) {
    return Response.json(
      { error: 'Live timing storage is not configured' },
      { status: 503, headers: noStoreHeaders },
    );
  }
  const requestedEventId =
    new URL(request.url).searchParams.get('event') || CURRENT_EVENT_ID;
  if (!/^[a-z0-9][a-z0-9-]{0,119}$/i.test(requestedEventId))
    return Response.json(
      { error: 'Invalid event identifier' },
      { status: 400, headers: noStoreHeaders },
    );
  return readSnapshot(requestedEventId);
}

async function readSnapshot(requestedEventId: string) {
  try {
    const [stored, sessionId, liveEventId] = await Promise.all([
      redisCommand(['GET', 'cvar:live']),
      redisCommand(['GET', 'cvar:live-session']),
      redisCommand(['GET', 'cvar:live-event']),
    ]);
    if (liveEventId !== requestedEventId)
      return Response.json(
        { error: 'No live session is available for this event' },
        { status: 404, headers: noStoreHeaders },
      );
    if (typeof stored !== 'string')
      return Response.json(
        { error: 'No live session is available' },
        { status: 404, headers: noStoreHeaders },
      );
    const snapshot = JSON.parse(stored);
    const racePositions =
      typeof sessionId === 'string' && snapshotUsesRacePositions(snapshot)
        ? await readRacePositions(
            `cvar:event:${requestedEventId}:session:${sessionId}`,
          )
        : {};
    return Response.json(
      {
        snapshot: hydrateRacePositions(snapshot, racePositions),
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
