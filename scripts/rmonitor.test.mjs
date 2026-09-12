import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTimingState,
  formatLapTime,
  parseCsvLine,
  timeToMilliseconds,
} from './rmonitor.mjs';

test('parses quoted RMonitor CSV fields', () => {
  assert.deepEqual(
    parseCsvLine('$A,"R1","65",123,"Sam","LeComte","Lotus, 23B",7'),
    ['$A', 'R1', '65', '123', 'Sam', 'LeComte', 'Lotus, 23B', '7'],
  );
});

test('converts protocol times', () => {
  assert.equal(timeToMilliseconds('00:02:03.826'), 123826);
  assert.equal(formatLapTime(123826), '2:03.826');
});

test('builds practice standings from Orbits records', () => {
  const state = createTimingState({
    eventName: 'CVAR',
    sessionMode: 'practice',
    streamId: 'test-stream',
  });
  [
    '$I,"08:00:00"',
    '$B,55,"Gp6-TT1=TT1"',
    '$C,7,"FA"',
    '$E,"TRACKNAME","Eagles Canyon Raceway"',
    '$A,"R1","65",123,"Sam","LeComte","6",7',
    '$A,"R2","14",456,"Morgan","Ellis","6",7',
    '$COMP,"R1","65",7,"Sam","LeComte","6","Austin TX"',
    '$F,9999,"00:15:00","08:19:35","00:16:07.400","GREEN"',
    '$J,"R1","00:02:03.826","00:02:03.826"',
    '$J,"R2","00:02:04.100","00:02:04.100"',
    '$H,1,"R1",1,"00:02:03.826"',
    '$H,2,"R2",1,"00:02:04.100"',
    '$SP,1,"R1",1,"00:02:03.826"',
  ].forEach((line) => state.apply(line));
  const snapshot = state.snapshot();
  assert.equal(snapshot.runId, '55');
  assert.equal(snapshot.runName, 'Gp6-TT1=TT1');
  assert.equal(snapshot.timeOfDay, '08:19:35');
  assert.equal(snapshot.raceTime, '00:16:07.400');
  assert.deepEqual(snapshot.classes, [{ id: 7, name: 'FA' }]);
  assert.equal(snapshot.settings.TRACKNAME, 'Eagles Canyon Raceway');
  assert.equal(snapshot.cars[0].number, '65');
  assert.equal(snapshot.cars[0].totalTime, '2:03.826');
  assert.equal(snapshot.cars[1].gap, '+0.274');
  assert.equal(snapshot.cars[0].groupName, 'Group 6');
  assert.equal(snapshot.cars[0].className, 'FA');
  assert.equal(snapshot.cars[0].bestLapNumber, 1);
  assert.equal(snapshot.cars[0].latestLapNumber, 1);
  assert.equal(snapshot.cars[0].latestScoreType, 'SP');
  const passings = state.drainPassings();
  assert.equal(passings.length, 2);
  assert.deepEqual(passings[0], {
    id: 'R1|00:02:03.826|1',
    registrationKey: 'R1',
    registrationNumber: 'R1',
    transponderId: '123',
    number: '65',
    sourceNumber: '65',
    driver: 'Sam LeComte',
    car: '',
    groupName: 'Group 6',
    nationality: '6',
    classNumber: 7,
    className: 'FA',
    additionalInfo: 'Austin TX',
    ambiguousRegistrationNumber: false,
    lapNumber: 1,
    lapTime: '2:03.826',
    lapTimeMs: 123826,
    totalTime: '00:02:03.826',
    totalTimeMs: 123826,
    recordedAt: passings[0].recordedAt,
  });
  assert.equal(state.drainPassings().length, 0);
  assert.deepEqual(state.registrations()[0], {
    registrationKey: 'R1',
    registrationNumber: 'R1',
    transponderId: '123',
    number: '65',
    sourceNumber: '65',
    firstName: 'Sam',
    lastName: 'LeComte',
    driver: 'Sam LeComte',
    car: '',
    nationality: '6',
    groupName: 'Group 6',
    additionalInfo: 'Austin TX',
    classNumber: 7,
    className: 'FA',
    ambiguousRegistrationNumber: false,
  });
  const rawRecords = state.drainRawRecords();
  assert.equal(rawRecords.length, 13);
  assert.deepEqual(rawRecords[1], {
    id: 'test-stream-0000000002',
    sequence: 2,
    command: '$B',
    fields: ['$B', '55', 'Gp6-TT1=TT1'],
    line: '$B,55,"Gp6-TT1=TT1"',
    observedAt: rawRecords[1].observedAt,
  });
  assert.equal(state.drainRawRecords().length, 0);
});

test('preserves duplicate Orbits registration numbers as separate competitors', () => {
  const state = createTimingState({
    sessionMode: 'practice',
    streamId: 'duplicates',
  });
  [
    '$H,1,"64",5,"00:02:07.912"',
    '$H,2,"64",0,"00:00:00.000"',
    '$A,"64","64",1803412,"Ian","Schoen","6",1',
    '$A,"64","64",212990,"Enrique","Contreras","6",1',
    '$C,1,"FF2"',
  ].forEach((line) => state.apply(line));
  const cars = state.snapshot().cars;
  assert.equal(cars.length, 2);
  assert.deepEqual(
    cars.map((car) => [
      car.registrationKey,
      car.number,
      car.driver,
      car.position,
    ]),
    [
      ['64', '64', 'Ian Schoen', 1],
      ['64#2', '64a', 'Enrique Contreras', 2],
    ],
  );
  assert.equal(cars[1].bestLap, '');
  assert.deepEqual(
    state
      .registrations()
      .map((registration) => [
        registration.registrationKey,
        registration.transponderId,
      ]),
    [
      ['64', '1803412'],
      ['64#2', '212990'],
    ],
  );
});

test('preserves official race positions while ranking the feed by best lap', () => {
  const state = createTimingState({
    sessionMode: 'race',
    streamId: 'best-lap-ranking',
  });
  [
    '$G,1,"R1",8,"00:16:00.000"',
    '$G,2,"R2",8,"00:16:10.000"',
    '$H,1,"R1",4,"00:02:03.000"',
    '$H,2,"R2",6,"00:02:01.500"',
  ].forEach((line) => state.apply(line));

  const cars = state.snapshot().cars;
  assert.deepEqual(
    cars.map((car) => [
      car.registrationNumber,
      car.position,
      car.racePosition,
      car.gap,
    ]),
    [
      ['R2', 1, 2, '—'],
      ['R1', 2, 1, '+1.500'],
    ],
  );
});
