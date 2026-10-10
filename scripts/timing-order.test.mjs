import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatSessionName,
  raceGapAtLastLap,
  rankSnapshotForSession,
  resultOrderForSession,
  withRaceStatuses,
} from '../lib/timing.ts';
import {
  hydrateRacePositions,
  parseRacePositionHash,
  parseRacePositionsFromRawRecords,
  snapshotUsesRacePositions,
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

test('keeps the complete entry after a driver car-number change', () => {
  const result = rankSnapshotForSession({
    ...snapshot('Gp6-R3=Race 3', 'race'),
    cars: [
      {
        registrationNumber: '64bk',
        number: '64bk',
        driver: 'Ian Schoen',
        position: 1,
        racePosition: 1,
        laps: 10,
        latestLapNumber: 10,
        totalTime: '20:49.514',
        bestLap: '2:03.748',
        gap: '',
      },
      {
        registrationNumber: '64',
        number: '64',
        driver: ' Ian   SCHOEN ',
        position: 10,
        racePosition: 10,
        laps: 1,
        latestLapNumber: 1,
        totalTime: '2:08.920',
        bestLap: '2:08.920',
        gap: '',
      },
    ],
  });

  assert.equal(result.cars.length, 1);
  assert.equal(result.cars[0].number, '64bk');
  assert.equal(result.cars[0].laps, 10);
  assert.equal(result.cars[0].totalTime, '20:49.514');
});

test('keeps same-base car numbers when the drivers differ', () => {
  const result = rankSnapshotForSession({
    ...snapshot('Gp1-R1=Race 1', 'race'),
    cars: [
      {
        registrationNumber: '83',
        number: '83',
        driver: 'Brian Rowlings',
        position: 11,
        racePosition: 11,
        laps: 7,
        totalTime: '18:00.664',
        bestLap: '2:31.295',
        gap: '',
      },
      {
        registrationNumber: '83a',
        number: '83a',
        driver: 'Gene Hassell',
        position: 14,
        racePosition: 14,
        laps: 5,
        totalTime: '12:08.199',
        bestLap: '2:24.531',
        gap: '',
      },
    ],
  });

  assert.deepEqual(
    result.cars.map((car) => car.number),
    ['83', '83a'],
  );
});

test('prefers the later Orbits entry when duplicate drivers have no laps', () => {
  const result = rankSnapshotForSession({
    ...snapshot('Gp6-R3=Race 3', 'race'),
    cars: [
      {
        registrationNumber: '16',
        number: '16',
        driver: 'Todd Strong',
        position: 36,
        racePosition: 36,
        laps: 0,
        totalTime: '',
        bestLap: '',
        gap: '',
      },
      {
        registrationNumber: '16b',
        number: '16b',
        driver: 'Todd Strong',
        position: 37,
        racePosition: 37,
        laps: 0,
        totalTime: '',
        bestLap: '',
        gap: '',
      },
    ],
  });

  assert.equal(result.cars.length, 1);
  assert.equal(result.cars[0].number, '16b');
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

test('expands Hallett Orbits session codes', () => {
  assert.equal(formatSessionName('G3 - TT1'), 'Group 3 · Test & Tune 1');
  assert.equal(formatSessionName('G2,7 - R2'), 'Groups 2 & 7 · Race 2');
  assert.equal(
    formatSessionName('G2/G7 - TT2'),
    'Groups 2 & 7 · Test & Tune 2',
  );
  assert.equal(
    formatSessionName('GSE - PQ'),
    'Group SE · Practice / Qualifying',
  );
  assert.equal(
    formatSessionName('GpSE-PQ=Practice & Qualify'),
    'Group SE · Practice & Qualify',
  );
  assert.equal(formatSessionName('Grid walk - lunch'), 'Grid walk - lunch');
});

test('Hallett race codes use official POS order', () => {
  assert.equal(resultOrderForSession('G3 - R1', 'practice'), 'position');
  assert.equal(resultOrderForSession('G3 - TT1', 'practice'), 'best-lap');
  assert.equal(snapshotUsesRacePositions({ runName: 'G3 - R1' }), true);
  assert.equal(snapshotUsesRacePositions({ runName: 'G3 - TT1' }), false);
});

test('DNF and DNS follow from the standings once the race is over', () => {
  // Friday's Formula V Feature, from Orbits' standings.
  const cars = [
    { number: '9', laps: 13, totalTime: '20:17.011' },
    { number: '56', laps: 12, totalTime: '20:32.928' },
    { number: '007', laps: 12, totalTime: '19:49.741' },
    { number: '73', laps: 7, totalTime: '13:02.375' },
    { number: '14', laps: 0, totalTime: '' },
  ];
  const finish = {
    flag: 'FINISH',
    flagStartedAt: '2026-10-09T21:52:03.320Z',
    updatedAt: '2026-10-09T21:54:18.510Z',
  };
  const statuses = (session, sessionOver) =>
    withRaceStatuses(cars, session, sessionOver).map(
      (car) => `${car.number}:${car.raceStatus || ''}`,
    );

  // #007 never crossed the line after the leader took the flag.
  assert.deepEqual(statuses(finish, true), [
    '9:',
    '56:',
    '007:DNF',
    '73:DNF',
    '14:DNS',
  ]);
  // While the race is still live, cars on their last lap get time to come
  // around before they are called.
  assert.deepEqual(statuses(finish, false), [
    '9:',
    '56:',
    '007:',
    '73:',
    '14:DNS',
  ]);
  assert.deepEqual(
    statuses({ ...finish, updatedAt: '2026-10-09T21:55:03.320Z' }, false),
    statuses(finish, true),
  );
  assert.deepEqual(statuses({ ...finish, flag: 'GREEN' }, true), [
    '9:',
    '56:',
    '007:',
    '73:',
    '14:',
  ]);
});
