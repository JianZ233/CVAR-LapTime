import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyCvarRacePoints,
  raceNumberFromRunName,
} from '../lib/race-points.ts';

test('calculates per-race start and finish points', () => {
  const cars = applyCvarRacePoints('Gp1-R1=Race 1', [
    { className: 'BP', laps: 8, points: null },
    {
      className: 'BP',
      laps: 7,
      points: null,
      resultAdjustment: { status: 'DNF' },
    },
    { className: 'BP', laps: 0, points: null },
    {
      className: 'BP',
      laps: 8,
      points: null,
      resultAdjustment: { status: 'DQ' },
    },
  ]);

  assert.deepEqual(
    cars.map((car) => car.points),
    [2, 1, 0, 0],
  );
});

test('adds feature-race points by class finishing position', () => {
  const cars = applyCvarRacePoints(
    'Gp6-R3=Race 3',
    Array.from({ length: 7 }, (_, index) => ({
      className: 'FF2',
      laps: 10 - index,
      points: null,
    })),
  );

  assert.deepEqual(
    cars.map((car) => car.points),
    [4, 4, 4, 4, 3, 3, 2],
  );
});

test('tracks feature positions independently for each class', () => {
  const cars = applyCvarRacePoints('Gp6-R3=Race 3', [
    { className: 'FF2', laps: 10, points: null },
    { className: 'FF1', laps: 10, points: null },
    { className: 'FF2', laps: 9, points: null },
    {
      className: 'FF2',
      laps: 8,
      points: null,
      resultAdjustment: { status: 'DNF' },
    },
    { className: '', laps: 8, points: null },
  ]);

  assert.deepEqual(
    cars.map((car) => car.points),
    [4, 4, 4, 1, 2],
  );
});

test('preserves points supplied by Orbits', () => {
  const [car] = applyCvarRacePoints('Gp6-R3=Race 3', [
    { className: 'FF2', laps: 10, points: 7 },
  ]);

  assert.equal(car.points, 7);
});

test('recognizes race names and Orbits race codes', () => {
  assert.equal(raceNumberFromRunName('Group 6 - Race 3'), 3);
  assert.equal(raceNumberFromRunName('Gp6-R3'), 3);
  assert.equal(raceNumberFromRunName('Gp6-PQ=Practice / Qualifying'), null);
});
