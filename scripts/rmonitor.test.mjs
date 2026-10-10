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
    id: 'R1|00:02:03.826',
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

test('keeps the complete row when Orbits retains a driver under an old number', () => {
  const state = createTimingState({
    sessionMode: 'race',
    streamId: 'renumbered-driver',
  });
  [
    '$A,"64bk","64bk",1803412,"Ian","Schoen","6",1',
    '$G,1,"64bk",10,"00:20:49.514"',
    '$H,1,"64bk",5,"00:02:03.748"',
    '$A,"64","64",1803412,"Ian","Schoen","6",1',
    '$G,10,"64",1,"00:02:08.920"',
    '$H,10,"64",1,"00:02:08.920"',
  ].forEach((line) => state.apply(line));

  const cars = state.snapshot().cars;
  assert.equal(cars.length, 1);
  assert.equal(cars[0].number, '64bk');
  assert.equal(cars[0].laps, 10);
  assert.equal(cars[0].totalTime, '20:49.514');
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

test('tracks race position movement between completed laps', () => {
  const state = createTimingState({
    sessionMode: 'race',
    streamId: 'position-movement',
  });
  [
    '$G,1,"R1",1,"00:02:00.000"',
    '$G,2,"R2",1,"00:02:01.000"',
    '$G,3,"R3",1,"00:02:02.000"',
    '$G,1,"R2",2,"00:04:00.000"',
    '$G,2,"R3",2,"00:04:01.000"',
    '$G,3,"R1",2,"00:04:02.000"',
  ].forEach((line) => state.apply(line));

  const changes = Object.fromEntries(
    state
      .snapshot()
      .cars.map((car) => [car.registrationNumber, car.positionChange]),
  );
  assert.deepEqual(changes, { R1: -2, R2: 1, R3: 1 });
});

test('keeps driver names when Orbits resets for a new session', () => {
  const state = createTimingState({ streamId: 'test-stream' });
  [
    '$A,"4","4",1001,"Ada","Lane","",1',
    '$A,"51","51",1002,"Bo","Reed","",1',
    '$I,"08:54:18","09 Oct 26"',
    '$B,28,"G1 - TT1"',
    '$A,"4","4",1001,"Ada","Lane","",1',
    '$COMP,"4","4",1,"Ada","Lane","",""',
    '$A,"51","51",1002,"Bo","Reed","",1',
    '$COMP,"51","51",1,"Bo","Reed","",""',
    '$G,1,"51",2,"00:03:25.751"',
    '$G,2,"4",2,"00:04:28.552"',
    '$H,1,"4",2,"00:01:37.787"',
    '$H,2,"51",2,"00:01:38.904"',
  ].forEach((line) => state.apply(line));

  assert.equal(state.registrations().length, 2);
  assert.deepEqual(
    state.snapshot().cars.map((car) => [car.number, car.driver]),
    [
      ['4', 'Ada Lane'],
      ['51', 'Bo Reed'],
    ],
  );
});

test('drops a position change when Orbits takes back a double-read lap', () => {
  const state = createTimingState({
    sessionMode: 'race',
    streamId: 'double-read',
  });
  const change = () =>
    state.snapshot().cars.find((car) => car.registrationNumber === '69')
      .positionChange;
  [
    '$G,1,"10",1,"00:01:40.000"',
    '$G,14,"69",1,"00:01:46.262"',
    '$G,1,"10",2,"00:03:20.000"',
    '$G,18,"69",2,"00:04:09.768"',
    // A second crossing 0.020 s later briefly counts as a lap in P1.
    '$G,1,"69",3,"00:04:09.788"',
    '$G,2,"10",2,"00:03:20.000"',
    // Orbits corrects it back to lap 2.
    '$G,1,"10",2,"00:03:20.000"',
    '$G,18,"69",2,"00:04:09.788"',
  ].forEach((line) => state.apply(line));
  assert.equal(change(), -4);

  ['$G,1,"10",3,"00:05:00.000"', '$G,17,"69",3,"00:06:05.321"'].forEach(
    (line) => state.apply(line),
  );
  assert.equal(change(), 1);
});

test('takes lap numbers from Orbits so a relay restart cannot shift them', () => {
  const lapNumbers = (state) =>
    state.drainPassings().map((passing) => passing.lapNumber);
  // Records from Friday's Formula V Feature: Orbits sends $J just before
  // the $G that counts the lap.
  const before = createTimingState({ sessionMode: 'race', streamId: 'a' });
  [
    // Pit out and the start: crossings without a lap time.
    '$J,"9","00:00:00.000","00:00:00.000"',
    '$G,2,"9",,"00:00:00.000"',
    '$J,"9","00:00:00.000","00:00:00.017"',
    '$G,2,"9",,"00:00:00.017"',
    '$J,"9","00:01:36.795","00:01:36.812"',
    '$G,2,"9",1,"00:01:36.812"',
    '$J,"9","00:01:33.169","00:03:09.981"',
    '$G,2,"9",2,"00:03:09.981"',
  ].forEach((line) => before.apply(line));
  assert.deepEqual(lapNumbers(before), [0, 0, 1, 2]);

  // The relay restarts; Orbits replays the standings on connect.
  const after = createTimingState({ sessionMode: 'race', streamId: 'b' });
  [
    '$G,2,"9",5,"00:07:48.649"',
    '$J,"9","00:01:33.902","00:09:22.551"',
    '$G,2,"9",6,"00:09:22.551"',
    '$J,"9","00:01:32.916","00:10:55.467"',
    '$G,1,"9",7,"00:10:55.467"',
  ].forEach((line) => after.apply(line));
  assert.deepEqual(lapNumbers(after), [6, 7]);
});

test('a loop double read or a repeated $J is not a lap', () => {
  const state = createTimingState({ sessionMode: 'race', streamId: 'c' });
  [
    '$G,1,"10",2,"00:03:20.000"',
    '$G,18,"69",2,"00:04:09.768"',
    // A second crossing 0.020 s later briefly counts as a lap in P1.
    '$J,"69","00:00:00.020","00:04:09.788"',
    '$G,1,"69",3,"00:04:09.788"',
    '$G,2,"10",2,"00:03:20.000"',
    // Orbits corrects it back to lap 2.
    '$G,1,"10",2,"00:03:20.000"',
    '$G,18,"69",2,"00:04:09.788"',
    '$J,"69","00:01:55.533","00:06:05.321"',
    '$J,"69","00:01:55.533","00:06:05.321"',
    '$G,17,"69",3,"00:06:05.321"',
  ].forEach((line) => state.apply(line));
  assert.deepEqual(
    state.drainPassings().map((passing) => passing.lapNumber),
    [0, 3],
  );
  const car = state
    .snapshot()
    .cars.find((entry) => entry.registrationNumber === '69');
  assert.equal(car.bestLap, '1:55.533');
});
