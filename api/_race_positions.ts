import { redisCommand } from './_redis.js';
import {
  parseRacePositionHash,
  parseRacePositionsFromRawRecords,
} from '../lib/race-positions.js';

export {
  hydrateRacePositions,
  parseRacePositionHash,
  parseRacePositionsFromRawRecords,
  racePositionForCar,
  snapshotUsesRacePositions,
} from '../lib/race-positions.js';

export async function readRacePositions(sessionPrefix: string) {
  const cacheKey = `${sessionPrefix}:race-positions`;
  const cached = parseRacePositionHash(
    await redisCommand(['HGETALL', cacheKey]),
  );
  if (Object.keys(cached).length) return cached;

  const rawIdsValue = await redisCommand([
    'ZRANGE',
    `${sessionPrefix}:raw-record-order`,
    -10_000,
    -1,
  ]);
  const rawIds = Array.isArray(rawIdsValue) ? rawIdsValue.map(String) : [];
  if (!rawIds.length) return cached;
  const rawRecords = await redisCommand([
    'HMGET',
    `${sessionPrefix}:raw-records`,
    ...rawIds,
  ]);
  const recovered = parseRacePositionsFromRawRecords(rawRecords);
  const entries = Object.entries(recovered);
  if (entries.length)
    await redisCommand([
      'HSET',
      cacheKey,
      ...entries.flatMap(([registrationNumber, position]) => [
        registrationNumber,
        position,
      ]),
    ]);
  return recovered;
}
