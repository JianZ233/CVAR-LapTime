// Sample sessions for the PDF result sheet. The test builds sheets from
// these, and running this file writes every sample to outputs/result-sheets
// (with one PNG per page on macOS) so the layout can be checked by eye:
//
//   node scripts/result-sheet-samples.mjs
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { register } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The API imports its siblings as './name.js'; point Node at the .ts files.
register(
  `data:text/javascript,${encodeURIComponent(`
    export async function resolve(specifier, context, nextResolve) {
      try {
        return await nextResolve(specifier, context);
      } catch (error) {
        if (error?.code !== 'ERR_MODULE_NOT_FOUND' || !/^\\.{1,2}\\/.*\\.js$/.test(specifier))
          throw error;
        return nextResolve(specifier.replace(/\\.js$/, '.ts'), context);
      }
    }
  `)}`,
);

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export async function loadResultSheet() {
  return import('../api/result-sheet.ts');
}

export async function readLogo() {
  return new Uint8Array(
    await readFile(path.join(root, 'public/cvar-logo.png')),
  );
}

const FIRST_NAMES = [
  'Sam',
  'Morgan',
  'Alex',
  'Chris',
  'Taylor',
  'Jordan',
  'Casey',
  'Riley',
  'Jamie',
  'Avery',
  'Quinn',
  'Drew',
  'Robin',
  'Hayden',
  'Parker',
  'Rowan',
  'Emerson',
  'Reese',
  'Blake',
  'Sawyer',
  'Dana',
  'Lee',
  'Kendall',
  'Marlowe',
];
const LAST_NAMES = [
  'LeComte',
  'Ellis',
  'Rivera',
  'Walker',
  'Reed',
  'Okafor',
  'Lindqvist',
  'Brennan',
  'Castillo',
  'Nakamura',
  'Whitfield',
  'Duarte',
  'Hollis',
  'Pruitt',
  'Abernathy',
  'Kowalski',
  'Ferreira',
  'Mendel',
  'Ashby',
  'Galloway',
  'Thorne',
];
const OPEN_WHEEL = [
  '1969 Lotus 61',
  '1967 Merlyn Mk11A',
  '1971 Zink Z-16',
  '1972 Crossle 20F',
  '1968 Titan Mk6',
  '1970 Caldwell D9B',
  '1974 Lola T340',
  '1969 Royale RP3',
  '1973 Hawke DL11',
  '1966 Alexis Mk8',
  '1971 Dulon LD9',
  '1970 Palliser WDF2',
  '1965 Brabham BT15',
  '1968 Lotus 51A',
  '1975 Van Diemen RF75',
];
const CLOSED_WHEEL = [
  '1965 Lotus 23B',
  '1972 Porsche 914',
  '1967 Alfa Romeo GTV',
  '1971 Datsun 240Z',
  '1969 Triumph GT6',
  '1963 MGB',
  '1959 Austin-Healey Sprite',
  '1966 Ford Mustang',
  '1970 BMW 2002',
  '1968 Volvo 122S',
  '1964 Lotus Elan',
  '1962 Triumph TR4',
];

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function lapTime(milliseconds) {
  const totalSeconds = milliseconds / 1_000;
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = (totalSeconds % 60).toFixed(3).padStart(6, '0');
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}

function clockTime(milliseconds) {
  const totalSeconds = Math.round(milliseconds / 1_000);
  return [
    Math.floor(totalSeconds / 3_600),
    Math.floor((totalSeconds % 3_600) / 60),
    totalSeconds % 60,
  ]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

/** Builds entrants with generated names, cars and paces. */
function entrants(count, { classes, cars, seed, pace = 121_000 }) {
  const next = random(seed);
  return Array.from({ length: count }, (_, index) => ({
    number: String(
      [65, 14, 42, 711, 88, 7, 23, 191, 5, 31, 96, 44][index % 12] +
        Math.floor(index / 12) * 100,
    ),
    driver: `${FIRST_NAMES[index % FIRST_NAMES.length]} ${LAST_NAMES[(index * 7 + Math.floor(index / FIRST_NAMES.length)) % LAST_NAMES.length]}`,
    car: cars[index % cars.length],
    className: classes[index % classes.length],
    pace: pace + index * 380 + Math.round(next() * 900),
  }));
}

/**
 * Runs a session: each car laps at its pace with some noise. In a race the
 * leader takes the flag after `laps` laps and everyone else on their next
 * crossing; in practice every car runs its own number of laps.
 */
function runSession(config) {
  const next = random(config.seed);
  const start = Date.parse(config.startsAt);
  const timelines = config.entries.map((entry) => {
    const laps = [];
    let total = 0;
    const target = entry.laps ?? config.laps + 3;
    for (let lap = 1; lap <= target; lap += 1) {
      if (entry.dns || (entry.retireAfter && lap > entry.retireAfter)) break;
      const time = Math.round(
        entry.pace + (lap === 1 ? 7_500 : 0) + (next() - 0.5) * 2_600,
      );
      total += time;
      laps.push({ lap, time, total });
    }
    return { entry, laps };
  });
  const race = config.sessionMode === 'race';
  let finish = 0;
  if (race) {
    finish = Math.min(
      ...timelines
        .filter((timeline) => timeline.laps.length >= config.laps)
        .map((timeline) => timeline.laps[config.laps - 1].total),
    );
    timelines.forEach((timeline) => {
      const last = timeline.laps.findIndex((lap) => lap.total >= finish);
      if (last >= 0) timeline.laps = timeline.laps.slice(0, last + 1);
    });
  } else
    finish = Math.max(
      ...timelines.map((timeline) => timeline.laps.at(-1)?.total || 0),
    );

  const results = timelines.map(({ entry, laps }, order) => {
    const best = laps.reduce(
      (fastest, lap) => (!fastest || lap.time < fastest.time ? lap : fastest),
      null,
    );
    const registration = `R${entry.number}`;
    const car = {
      registrationKey: registration,
      registrationNumber: registration,
      number: entry.number,
      driver: entry.driver,
      car: entry.car || '',
      groupName: config.groups[0] || '',
      className: entry.className,
      position: 0,
      laps: laps.length,
      bestLapNumber: best?.lap || 0,
      totalTime: laps.length ? lapTime(laps.at(-1).total) : '',
      bestLap: best ? lapTime(best.time) : '',
      gap: '',
      points: null,
    };
    return {
      car,
      order,
      totalMs: laps.at(-1)?.total ?? Number.POSITIVE_INFINITY,
      bestMs: best?.time ?? Number.POSITIVE_INFINITY,
    };
  });
  const ordered = [...results].sort((left, right) =>
    race
      ? right.car.laps - left.car.laps || left.totalMs - right.totalMs
      : left.bestMs - right.bestMs || left.order - right.order,
  );
  const cars = ordered.map(({ car }, index) => ({
    ...car,
    position: index + 1,
    ...(race ? { racePosition: index + 1 } : {}),
  }));
  const passings = timelines.flatMap(({ entry, laps }) =>
    laps.map((lap) => ({
      registrationKey: `R${entry.number}`,
      registrationNumber: `R${entry.number}`,
      number: entry.number,
      driver: entry.driver,
      lapNumber: lap.lap,
      lapTime: lapTime(lap.time),
      lapTimeMs: lap.time,
      totalTimeMs: lap.total,
      recordedAt: new Date(start + lap.total).toISOString(),
    })),
  );
  return {
    snapshot: {
      eventName: config.eventName ?? '20th Annual Mike Stephens Classic',
      trackName: config.trackName ?? 'Hallett Motor Racing Circuit',
      trackLength: config.trackLength ?? '1.8 mi · 10 turns',
      runName: config.runName,
      sessionMode: config.sessionMode,
      flag: config.flag ?? 'FINISH',
      timeToGo: '00:00:00',
      raceTime: clockTime(finish),
      initializedAt: config.startsAt,
      updatedAt: new Date(start + finish + 240_000).toISOString(),
      groups: config.groups,
      cars,
    },
    passings: passings.sort((left, right) =>
      left.recordedAt.localeCompare(right.recordedAt),
    ),
    adjustments: config.adjustments || {},
  };
}

function adjustment(fields) {
  return {
    penaltySeconds: 0,
    positionOverride: null,
    status: '',
    note: '',
    updatedAt: '2026-10-10T20:05:00.000Z',
    ...fields,
  };
}

export const samples = {
  'race-penalties': () => {
    const entries = entrants(14, {
      classes: ['FF2', 'FF1', 'FC', 'FF3'],
      cars: OPEN_WHEEL,
      seed: 11,
    });
    entries[8].retireAfter = 6;
    entries[13].dns = true;
    return runSession({
      seed: 3,
      runName: 'Gp6-R3=Race 3',
      sessionMode: 'race',
      groups: ['Group 6'],
      laps: 10,
      startsAt: '2026-10-10T19:30:00.000Z',
      entries,
      adjustments: {
        R42: adjustment({
          status: 'PENALTY',
          penaltySeconds: 5,
          note: 'Avoidable contact with #14 at turn 1 on lap 3.',
        }),
        R5: adjustment({ status: 'DNF', note: 'Retired on lap 6, gearbox.' }),
        R114: adjustment({
          status: 'DNS',
          note: 'Withdrawn before the start.',
        }),
        R711: adjustment({
          status: 'DQ',
          note: 'Car under the minimum weight at post-race scrutineering.',
        }),
        R23: adjustment({ positionOverride: 4, note: '' }),
      },
    });
  },
  'practice-qualifying': () => {
    const entries = entrants(16, {
      classes: ['FF2', 'FF1', 'FC'],
      cars: OPEN_WHEEL,
      seed: 21,
    }).map((entry, index) => ({ ...entry, laps: 5 + (index % 4) }));
    entries[15].dns = true;
    return runSession({
      seed: 8,
      runName: 'Gp6-PQ=PQ',
      sessionMode: 'practice',
      groups: ['Group 6'],
      laps: 8,
      startsAt: '2026-10-10T14:05:00.000Z',
      entries,
      adjustments: {
        R14: adjustment({
          status: 'PENALTY',
          penaltySeconds: 2,
          note: 'Exceeded track limits at turn 6; fastest lap time adjusted.',
        }),
      },
    });
  },
  'large-field': () => {
    const entries = entrants(44, {
      classes: ['FF2', 'FF1', 'FC', 'FF3', 'FB', 'FF2000', 'FA'],
      cars: OPEN_WHEEL,
      seed: 31,
      pace: 119_500,
    });
    entries[17].retireAfter = 4;
    entries[30].retireAfter = 9;
    entries[41].dns = true;
    return runSession({
      seed: 5,
      runName: 'Gp3-R2=Race 2',
      sessionMode: 'race',
      groups: ['Group 3'],
      laps: 14,
      startsAt: '2026-10-11T16:10:00.000Z',
      entries,
      adjustments: {
        R107: adjustment({ status: 'DNF', note: 'Stopped at turn 8.' }),
        R223: adjustment({ status: 'DNF', note: '' }),
        R23: adjustment({
          status: 'PENALTY',
          penaltySeconds: 10,
          note: 'Jumped the start.',
        }),
      },
    });
  },
  'long-names': () => {
    const entries = entrants(10, {
      classes: [
        'ECR Big Bore Unlimited',
        'Spec Boxster',
        'G4T(T2)',
        'C Modified',
      ],
      cars: CLOSED_WHEEL,
      seed: 41,
      pace: 128_000,
    });
    Object.assign(entries[0], {
      number: '1932',
      driver: 'Bartholomew Montgomery-Fitzwilliam III',
      car: '1967 Shelby Cobra 427 Super Snake Continuation Roadster',
    });
    Object.assign(entries[1], {
      number: '808',
      driver: 'Zoë Ångström-Fairweather de la Cruz',
      car: '1959 Austin-Healey Bugeye Sprite Mk I (Sebring specification)',
    });
    Object.assign(entries[2], {
      driver: 'José Ñúñez-Iturbe',
      car: '1970 Alfa Romeo Giulia GTAm 1750 Corsa',
    });
    entries[5].retireAfter = 3;
    return runSession({
      seed: 13,
      runName: '1.7L and Above Closed Wheel',
      sessionMode: 'race',
      groups: ['Group 1', 'Group 2', 'Group 7'],
      laps: 8,
      eventName:
        'Canyon Classic at Eagles Canyon Raceway — Fall Vintage Festival',
      trackName: 'Eagles Canyon Raceway (full course, clockwise)',
      trackLength: '2.750',
      startsAt: '2026-09-12T21:40:00.000Z',
      entries,
      adjustments: {
        R1932: adjustment({
          status: 'PENALTY',
          penaltySeconds: 30,
          note: 'Drive-through penalty converted to 30 seconds after the race: passing under the waved yellow at turn 10 on lap 4, overtaking off track at turn 2 on lap 6, and failing to follow a black-flag instruction from race control on lap 7.',
        }),
        R88: adjustment({
          status: 'DQ',
          note: 'Unsafe release from the hot pits.',
        }),
      },
    });
  },
  'letter-group': () => {
    const entries = entrants(9, {
      classes: ['ECR Big Bore', 'Spec Boxster', 'Spec Miata'],
      cars: CLOSED_WHEEL,
      seed: 51,
      pace: 126_000,
    });
    return runSession({
      seed: 17,
      runName: 'GpSE-R1=Race 1',
      sessionMode: 'race',
      groups: ['SE'],
      laps: 9,
      eventName: 'Canyon Classic at ECR',
      trackName: 'Eagles Canyon Raceway',
      trackLength: '2.750',
      startsAt: '2026-09-12T20:05:00.000Z',
      entries,
    });
  },
};

async function main() {
  const { createResultSheet } = await loadResultSheet();
  const { PDFDocument, rgb } = await import('pdf-lib');
  const outDir = path.join(root, 'outputs/result-sheets');
  await rm(outDir, { recursive: true, force: true });
  await mkdir(path.join(outDir, 'pages'), { recursive: true });
  const logo = await readLogo();
  const extra = process.argv.slice(2);
  const jobs = Object.entries(samples).map(([name, build]) => ({
    name,
    sample: build(),
  }));
  // Extra arguments: saved session JSON files ({ snapshot, passings?, adjustments? }).
  for (const file of extra) {
    const saved = JSON.parse(await readFile(file, 'utf8'));
    jobs.push({
      name: path.basename(file, '.json'),
      sample: {
        snapshot: saved.snapshot,
        passings: saved.passings || [],
        adjustments: saved.adjustments || {},
      },
    });
  }
  for (const { name, sample } of jobs) {
    const pdf = await createResultSheet(
      sample.snapshot,
      sample.passings,
      logo,
      sample.adjustments,
    );
    const file = path.join(outDir, `${name}.pdf`);
    await writeFile(file, pdf);
    const document = await PDFDocument.load(pdf);
    console.log(
      `${name}.pdf  ${document.getPageCount()} pages  ${pdf.length} bytes`,
    );
    if (process.platform !== 'darwin') continue;
    for (let index = 0; index < document.getPageCount(); index += 1) {
      // sips renders an unpainted page as transparent; lay it on white.
      const single = await PDFDocument.create();
      const [embedded] = await single.embedPdf(pdf, [index]);
      const page = single.addPage([embedded.width, embedded.height]);
      page.drawRectangle({
        x: 0,
        y: 0,
        width: embedded.width,
        height: embedded.height,
        color: rgb(1, 1, 1),
      });
      page.drawPage(embedded);
      const pagePdf = path.join(outDir, 'pages', `${name}-p${index + 1}.pdf`);
      await writeFile(pagePdf, await single.save());
      execFileSync(
        'sips',
        [
          '-s',
          'format',
          'png',
          '--resampleHeightWidthMax',
          '1800',
          pagePdf,
          '--out',
          pagePdf.replace(/\.pdf$/, '.png'),
        ],
        { stdio: 'ignore' },
      );
      await rm(pagePdf);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await main();
