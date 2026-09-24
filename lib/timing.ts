export type TimingCar = {
  registrationKey?: string;
  registrationNumber: string;
  number: string;
  driver: string;
  car: string;
  groupName: string;
  classNumber: number | null;
  className: string;
  position: number;
  racePosition?: number;
  positionChange?: number;
  laps: number;
  bestLapNumber: number;
  latestLapNumber: number;
  latestScoreType: string;
  ambiguousRegistrationNumber?: boolean;
  totalTime: string;
  lastLap: string;
  bestLap: string;
  gap: string;
  points?: number | null;
  adjustedBestLap?: string;
  resultAdjustment?: {
    penaltySeconds: number;
    positionOverride: number | null;
    status: '' | 'PENALTY' | 'DNF' | 'DNS' | 'DQ';
    note: string;
    updatedAt: string;
  };
};

export type TimingSnapshot = {
  eventName: string;
  trackName: string;
  trackLength: string;
  runId: string;
  runName: string;
  sessionMode: 'race' | 'practice';
  flag: string;
  flagStartedAt: string;
  lapsToGo: number | null;
  timeToGo: string;
  timeOfDay: string;
  raceTime: string;
  initializedAt: string;
  classes: Array<{ id: number; name: string }>;
  groups: string[];
  settings: Record<string, string>;
  source: {
    protocol: string;
    recordsCaptured: number;
    commandCounts: Record<string, number>;
  };
  updatedAt: string;
  cars: TimingCar[];
};

export const demoSnapshot: TimingSnapshot = {
  eventName: '20th Annual Mike Stephens Classic',
  trackName: 'Hallett Motor Racing Circuit',
  trackLength: '1.8 mi · 10 turns',
  runId: 'demo',
  runName: 'Pre-race timing check',
  sessionMode: 'practice',
  flag: 'GREEN',
  flagStartedAt: new Date().toISOString(),
  lapsToGo: null,
  timeToGo: '18:42',
  timeOfDay: '08:19:35',
  raceTime: '00:16:07.400',
  initializedAt: new Date().toISOString(),
  classes: [
    { id: 1, name: 'FF2' },
    { id: 2, name: 'FF1' },
    { id: 3, name: 'FF3' },
  ],
  groups: ['Group 6'],
  settings: { TRACKNAME: 'Hallett Motor Racing Circuit', TRACKLENGTH: '1.800' },
  source: {
    protocol: 'RMonitor',
    recordsCaptured: 160,
    commandCounts: { $A: 35, $C: 7, $F: 10 },
  },
  updatedAt: new Date().toISOString(),
  cars: [
    {
      position: 1,
      registrationNumber: 'CVAR65',
      number: '65',
      driver: 'Sam LeComte',
      car: '1965 Lotus 23B',
      groupName: 'Group 6',
      classNumber: 1,
      className: 'FF2',
      laps: 8,
      bestLapNumber: 7,
      latestLapNumber: 8,
      latestScoreType: 'SP',
      totalTime: '16:19.204',
      lastLap: '2:02.418',
      bestLap: '2:00.871',
      gap: '—',
    },
    {
      position: 2,
      registrationNumber: 'CVAR14',
      number: '14',
      driver: 'Morgan Ellis',
      car: '1972 Porsche 914',
      groupName: 'Group 6',
      classNumber: 2,
      className: 'FF1',
      laps: 8,
      bestLapNumber: 6,
      latestLapNumber: 8,
      latestScoreType: 'SP',
      totalTime: '16:22.118',
      lastLap: '2:03.026',
      bestLap: '2:01.442',
      gap: '+0.571',
    },
    {
      position: 3,
      registrationNumber: 'CVAR42',
      number: '42',
      driver: 'Alex Rivera',
      car: '1967 Alfa Romeo GTV',
      groupName: 'Group 6',
      classNumber: 1,
      className: 'FF2',
      laps: 8,
      bestLapNumber: 5,
      latestLapNumber: 8,
      latestScoreType: 'SP',
      totalTime: '16:25.477',
      lastLap: '2:04.119',
      bestLap: '2:02.205',
      gap: '+1.334',
    },
    {
      position: 4,
      registrationNumber: 'CVAR711',
      number: '711',
      driver: 'Chris Walker',
      car: '1971 Datsun 240Z',
      groupName: 'Group 6',
      classNumber: 2,
      className: 'FF1',
      laps: 7,
      bestLapNumber: 5,
      latestLapNumber: 7,
      latestScoreType: 'SP',
      totalTime: '14:19.804',
      lastLap: '2:02.997',
      bestLap: '2:02.611',
      gap: '+1.740',
    },
    {
      position: 5,
      registrationNumber: 'CVAR88',
      number: '88',
      driver: 'Taylor Reed',
      car: '1969 Triumph GT6',
      groupName: 'Group 6',
      classNumber: 3,
      className: 'FF3',
      laps: 7,
      bestLapNumber: 4,
      latestLapNumber: 7,
      latestScoreType: 'SP',
      totalTime: '14:47.332',
      lastLap: '2:08.312',
      bestLap: '2:06.774',
      gap: '+5.903',
    },
  ],
};

export function isTimingSnapshot(value: unknown): value is TimingSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<TimingSnapshot>;
  return (
    typeof snapshot.eventName === 'string' &&
    typeof snapshot.trackName === 'string' &&
    typeof snapshot.runName === 'string' &&
    typeof snapshot.updatedAt === 'string' &&
    Array.isArray(snapshot.cars) &&
    snapshot.cars.length <= 500
  );
}

export type ResultOrder = 'best-lap' | 'position';

export function resultOrderForSession(
  runName: string,
  sessionMode?: TimingSnapshot['sessionMode'],
): ResultOrder {
  return sessionMode === 'race' ||
    /\brace(?:\s*\d+)?\b/i.test(formatSessionName(runName))
    ? 'position'
    : 'best-lap';
}

export function rankSnapshotForSession(
  snapshot: TimingSnapshot,
): TimingSnapshot {
  const resultOrder = resultOrderForSession(
    snapshot.runName,
    snapshot.sessionMode,
  );
  const ranked = deduplicateDriverEntries(snapshot.cars).sort((left, right) => {
    const leftStatus = resultStatusOrder(left.resultAdjustment?.status);
    const rightStatus = resultStatusOrder(right.resultAdjustment?.status);
    if (leftStatus !== rightStatus) return leftStatus - rightStatus;
    if (resultOrder === 'position') {
      const positionDifference =
        officialPosition(left) - officialPosition(right);
      if (positionDifference) return positionDifference;
    } else {
      const leftTime = adjustedLapMilliseconds(left);
      const rightTime = adjustedLapMilliseconds(right);
      if (leftTime !== rightTime) return leftTime - rightTime;
    }
    return left.position - right.position;
  });
  const overrides = ranked
    .filter((car) => car.resultAdjustment?.positionOverride)
    .sort(
      (left, right) =>
        (left.resultAdjustment?.positionOverride || 0) -
        (right.resultAdjustment?.positionOverride || 0),
    );
  overrides.forEach((car) => {
    const currentIndex = ranked.indexOf(car);
    if (currentIndex >= 0) ranked.splice(currentIndex, 1);
    ranked.splice(
      Math.min(
        ranked.length,
        Math.max(0, (car.resultAdjustment?.positionOverride || 1) - 1),
      ),
      0,
      car,
    );
  });
  const fastestTime = Math.min(...ranked.map(adjustedLapMilliseconds));
  const raceLeader = ranked[0];

  return {
    ...snapshot,
    cars: ranked.map((car, index) => {
      const carTime = adjustedLapMilliseconds(car);
      const hasGap = Number.isFinite(fastestTime) && Number.isFinite(carTime);
      const penalty = car.resultAdjustment?.penaltySeconds || 0;
      return {
        ...car,
        position: index + 1,
        adjustedBestLap:
          penalty > 0 && Number.isFinite(carTime)
            ? millisecondsToLapTime(carTime)
            : undefined,
        gap:
          resultOrder === 'position'
            ? index === 0
              ? '—'
              : raceLeader
                ? raceGapAtLastLap(raceLeader, car)
                : ''
            : carTime === fastestTime
              ? '—'
              : hasGap
                ? `+${((carTime - fastestTime) / 1000).toFixed(3)}`
                : '',
      };
    }),
  };
}

export function deduplicateDriverEntries<
  T extends {
    driver?: string;
    laps?: number;
    totalTime?: string;
    bestLap?: string;
    latestLapNumber?: number;
  },
>(cars: T[]): T[] {
  const selectedByDriver = new Map<string, T>();

  for (const car of cars) {
    const driverKey = normalizeDriverName(car.driver);
    if (!driverKey) continue;
    const selected = selectedByDriver.get(driverKey);
    if (!selected || compareTimingCompleteness(car, selected) >= 0)
      selectedByDriver.set(driverKey, car);
  }

  return cars.filter((car) => {
    const driverKey = normalizeDriverName(car.driver);
    return !driverKey || selectedByDriver.get(driverKey) === car;
  });
}

function compareTimingCompleteness(
  left: {
    laps?: number;
    totalTime?: string;
    bestLap?: string;
    latestLapNumber?: number;
  },
  right: {
    laps?: number;
    totalTime?: string;
    bestLap?: string;
    latestLapNumber?: number;
  },
) {
  return (
    safeTimingNumber(left.laps) - safeTimingNumber(right.laps) ||
    safeTimingNumber(left.latestLapNumber) -
      safeTimingNumber(right.latestLapNumber) ||
    Number(Boolean(left.totalTime)) - Number(Boolean(right.totalTime)) ||
    Number(Boolean(left.bestLap)) - Number(Boolean(right.bestLap))
  );
}

function normalizeDriverName(value?: string) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/\s+/g, ' ');
}

function safeTimingNumber(value?: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function officialPosition(car: TimingCar) {
  const position = car.racePosition || car.position;
  return Number.isInteger(position) && position > 0
    ? position
    : Number.MAX_SAFE_INTEGER;
}

function adjustedLapMilliseconds(car: TimingCar) {
  const base = lapTimeToMilliseconds(car.bestLap);
  const status = car.resultAdjustment?.status || '';
  if (['DNF', 'DNS', 'DQ'].includes(status)) return Number.POSITIVE_INFINITY;
  return Number.isFinite(base)
    ? base + (car.resultAdjustment?.penaltySeconds || 0) * 1_000
    : base;
}

function resultStatusOrder(status = '') {
  return status === 'DQ' ? 4 : status === 'DNS' ? 3 : status === 'DNF' ? 2 : 0;
}

function millisecondsToLapTime(value: number) {
  const totalSeconds = value / 1_000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `${minutes}:${seconds.toFixed(3).padStart(6, '0')}`;
}

export function raceGapAtLastLap(
  ahead: Pick<TimingCar, 'laps' | 'totalTime'>,
  behind: Pick<TimingCar, 'laps' | 'totalTime'>,
) {
  const lapDifference = safeLaps(ahead.laps) - safeLaps(behind.laps);
  if (lapDifference > 0)
    return `+${lapDifference} ${lapDifference === 1 ? 'lap' : 'laps'}`;
  if (lapDifference < 0) return '';

  const aheadTime = lapTimeToMilliseconds(ahead.totalTime);
  const behindTime = lapTimeToMilliseconds(behind.totalTime);
  if (!Number.isFinite(aheadTime) || !Number.isFinite(behindTime)) return '';
  const difference = behindTime - aheadTime;
  return difference >= 0 ? formatElapsedGap(difference) : '';
}

function safeLaps(value: number) {
  return Number.isInteger(value) && value > 0 ? value : 0;
}

function formatElapsedGap(milliseconds: number) {
  const totalSeconds = milliseconds / 1_000;
  if (totalSeconds < 60) return `+${totalSeconds.toFixed(3)}`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `+${minutes}:${seconds.toFixed(3).padStart(6, '0')}`;
}

export function formatSessionName(value: string) {
  const wheelSession = wheelSessionName(value);
  if (wheelSession) return wheelSession;
  // Group codes are usually numbers ("Gp2,7") but can be letters ("GpSE").
  const match = value.match(/^Gp([0-9A-Z,]+)-([^=]+)(?:=(.+))?$/i);
  if (!match) return value;
  const groups = match[1].split(',');
  const groupLabel =
    groups.length === 1
      ? `Group ${groups[0]}`
      : `Groups ${groups.slice(0, -1).join(', ')} & ${groups.at(-1)}`;
  const sessionLabel = (match[3] || match[2])
    .replace(/^TT(\d+)$/i, 'Test & Tune $1')
    .replace(/^R(\d+)$/i, 'Race $1')
    .replace(/^PQ$/i, 'Practice / Qualifying');
  return `${groupLabel} · ${sessionLabel}`;
}

function wheelSessionName(value: string) {
  const explicitName = value.match(/=(Open|Closed)\s+Wheel\s*$/i)?.[1];
  if (explicitName)
    return `${explicitName[0].toUpperCase()}${explicitName.slice(1).toLowerCase()} Wheel`;
  const code = value.match(/(?:^|[-_=])(OW|CW)(?:$|[-_=])/i)?.[1];
  return code?.toUpperCase() === 'OW'
    ? 'Open Wheel'
    : code?.toUpperCase() === 'CW'
      ? 'Closed Wheel'
      : '';
}

export function formatTrackPrimary(value: string) {
  const distance = value.split('·')[0]?.trim() || '1.8 mi';
  const match = distance.match(/^(\d+(?:\.\d+)?)\s*(?:mi|miles?)?$/i);
  if (!match) return distance;
  return `${Number(match[1]).toLocaleString('en-US', { maximumFractionDigits: 3 })} mi`;
}

export function formatTrackDetail(value: string, trackName = '') {
  const detail = value.split('·')[1]?.trim();
  if (detail) return detail;
  if (/eagles canyon/i.test(trackName)) return '15 turns';
  if (/hallett/i.test(trackName)) return '10 turns';
  return 'Start / finish loop';
}

export function formatTrackSummary(value: string, trackName = '') {
  return `${formatTrackPrimary(value)} · ${formatTrackDetail(value, trackName)}`;
}

export function lapTimeToMilliseconds(value: string) {
  if (!value) return Number.POSITIVE_INFINITY;
  const parts = value.split(':');
  const seconds = Number(parts.pop());
  if (!Number.isFinite(seconds)) return Number.POSITIVE_INFINITY;
  const minutes = Number(parts.pop() || 0);
  const hours = Number(parts.pop() || 0);
  if (!Number.isFinite(minutes) || !Number.isFinite(hours))
    return Number.POSITIVE_INFINITY;
  return ((hours * 60 + minutes) * 60 + seconds) * 1000;
}
