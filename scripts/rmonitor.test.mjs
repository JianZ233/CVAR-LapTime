import assert from 'node:assert/strict';
import test from 'node:test';

import { createTimingState, formatLapTime, parseCsvLine, timeToMilliseconds } from './rmonitor.mjs';

test('parses quoted RMonitor CSV fields', () => {
  assert.deepEqual(parseCsvLine('$A,"R1","65",123,"Sam","LeComte","Lotus, 23B",7'), ['$A', 'R1', '65', '123', 'Sam', 'LeComte', 'Lotus, 23B', '7']);
});

test('converts protocol times', () => {
  assert.equal(timeToMilliseconds('00:02:03.826'), 123826);
  assert.equal(formatLapTime(123826), '2:03.826');
});

test('builds practice standings from Orbits records', () => {
  const state = createTimingState({ eventName: 'CVAR', sessionMode: 'practice' });
  ['$B,1,"Practice 1"', '$C,7,"Group 7"', '$A,"R1","65",123,"Sam","LeComte","Lotus 23B",7', '$A,"R2","14",456,"Morgan","Ellis","Porsche 914",7', '$J,"R1","00:02:03.826","00:02:03.826"', '$J,"R2","00:02:04.100","00:02:04.100"', '$H,1,"R1",1,"00:02:03.826"', '$H,2,"R2",1,"00:02:04.100"'].forEach((line) => state.apply(line));
  const snapshot = state.snapshot();
  assert.equal(snapshot.cars[0].number, '65');
  assert.equal(snapshot.cars[1].gap, '+0.274');
  assert.equal(snapshot.cars[0].className, 'Group 7');
});
