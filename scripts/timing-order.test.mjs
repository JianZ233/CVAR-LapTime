import assert from 'node:assert/strict';
import test from 'node:test';

import {
  raceGapAtLastLap,
  rankSnapshotForSession,
  resultOrderForSession,
} from '../lib/timing.ts';
import {
  hydrateRacePositions,
  parseRacePositionHash,
  parseRacePositionsFromRawRecords,
} from '../lib/race-positions.ts';

function snapshot(runName, sessionMode = 'practice') {
  return {
    runName,
    sessionMode,
    cars: [
      {
        registrationNumber: 'R1',
        number: '1',
        position: 2,
        racePosition: 1,
        laps: 8,
        totalTime: '16:10.000',
        bestLap: '2:03.000',
        gap: '',
      },
      {
        registrationNumber: 'R2',
        number: '2',
        position: 1,
        racePosition: 2,
        laps: 8,
        totalTime: '16:12.500',
        bestLap: '2:01.500',
        gap: '',
      },
    ],
  };
}

test('all race results use official POS order', () => {
  const result = rankSnapshotForSession(snapshot('Gp6-R1=Race 1', 'race'));
  assert.equal(
    resultOrderForSession(result.runName, result.sessionMode),
    'position',
  );
  assert.deepEqual(
    result.cars.map((car) => car.registrationNumber),
    ['R1', 'R2'],
  );
  assert.deepEqual(
    result.cars.map((car) => car.gap),
    ['—', '+2.500'],
  );
});

test('practice and qualifying results use best-lap order', () => {
  const result = rankSnapshotForSession(
    snapshot('Gp6-PQ=Practice / Qualifying'),
  );
  assert.equal(
    resultOrderForSession(result.runName, result.sessionMode),
    'best-lap',
  );
  assert.deepEqual(
    result.cars.map((car) => car.registrationNumber),
    ['R2', 'R1'],
  );
  assert.deepEqual(
    result.cars.map((car) => car.gap),
    ['—', '+1.500'],
  );
});

test('hydrates POS captured by an already-running relay', () => {
  const positions = parseRacePositionHash(['R1', '2', 'R2', '1']);
  const result = hydrateRacePositions(
    snapshot('Gp6-R2=Race 2', 'race'),
    positions,
  );
  assert.deepEqual(
    result.cars.map((car) => car.racePosition),
    [1, 2],
  );

  const withoutEmbeddedPositions = {
    ...snapshot('Gp6-R2=Race 2', 'race'),
    cars: snapshot('Gp6-R2=Race 2', 'race').cars.map(
      ({ racePosition: _racePosition, ...car }) => car,
    ),
  };
  const hydrated = hydrateRacePositions(withoutEmbeddedPositions, positions);
  assert.deepEqual(
    hydrated.cars.map((car) => car.racePosition),
    [2, 1],
  );
});

test('recovers POS from archived RMonitor race records', () => {
  const positions = parseRacePositionsFromRawRecords([
    JSON.stringify({ command: '$G', fields: ['$G', '2', 'R1'] }),
    JSON.stringify({ command: '$H', fields: ['$H', '1', 'R1'] }),
    JSON.stringify({ command: '$G', fields: ['$G', '1', 'R2'] }),
  ]);
  assert.deepEqual(positions, { R1: 2, R2: 1 });
});

test('race gaps use elapsed time at the last completed lap', () => {
  assert.equal(
    raceGapAtLastLap(
      { laps: 8, totalTime: '16:10.000' },
      { laps: 8, totalTime: '16:12.500' },
    ),
    '+2.500',
  );
  assert.equal(
    raceGapAtLastLap(
      { laps: 8, totalTime: '16:10.000' },
      { laps: 7, totalTime: '14:05.000' },
    ),
    '+1 lap',
  );
});
