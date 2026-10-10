import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

// The site imports '@/lib/name'; point Node at lib/name.ts.
register(
  `data:text/javascript,${encodeURIComponent(`
    export async function resolve(specifier, context, nextResolve) {
      if (!specifier.startsWith('@/')) return nextResolve(specifier, context);
      return nextResolve(
        new URL(specifier.slice(2) + '.ts', ${JSON.stringify(new URL('../', import.meta.url).href)}).href,
        context,
      );
    }
  `)}`,
);

const { sessionClock } = await import('../lib/timing-display.ts');

// G4 Race 1 a few seconds before its 20-minute clock ran out.
const race = {
  runName: 'G4 - Race 1',
  sessionMode: 'race',
  flag: 'GREEN',
  lapsToGo: 9999,
  timeToGo: '00:00:03',
};

test('a race shows the last lap once its clock runs out', () => {
  assert.deepEqual(sessionClock(race, 'live', 0), {
    value: '00:03',
    label: 'Remaining',
  });
  // The board ticks the clock down between updates from Orbits.
  assert.deepEqual(sessionClock(race, 'live', 3), {
    value: '1',
    label: 'Lap to go',
  });
  assert.deepEqual(sessionClock({ ...race, timeToGo: '00:00:00' }, 'live', 0), {
    value: '1',
    label: 'Lap to go',
  });
  // Orbits sometimes counts the last lap itself.
  assert.deepEqual(
    sessionClock({ ...race, timeToGo: '00:00:00', lapsToGo: 1 }, 'live', 0),
    { value: '1', label: 'Lap to go' },
  );
  assert.deepEqual(
    sessionClock({ ...race, timeToGo: '00:00:00', flag: 'FINISH' }, 'live', 0)
      .label,
    'Session finished',
  );
});

test('practice and stopped races keep the clock at zero', () => {
  assert.deepEqual(
    sessionClock(
      {
        ...race,
        runName: 'G4 - P&Q',
        sessionMode: 'practice',
        timeToGo: '00:00:00',
      },
      'live',
      0,
    ),
    { value: '00:00', label: 'Remaining' },
  );
  assert.deepEqual(
    sessionClock({ ...race, timeToGo: '00:00:00', flag: 'RED' }, 'live', 0),
    { value: '00:00', label: 'Remaining' },
  );
});
