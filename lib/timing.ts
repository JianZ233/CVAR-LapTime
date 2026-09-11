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
  laps: number;
  bestLapNumber: number;
  latestLapNumber: number;
  latestScoreType: string;
  ambiguousRegistrationNumber?: boolean;
  totalTime: string;
  lastLap: string;
  bestLap: string;
  gap: string;
};

export type TimingSnapshot = {
  eventName: string;
  trackName: string;
  trackLength: string;
  runId: string;
  runName: string;
  sessionMode: 'race' | 'practice';
  flag: string;
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
  eventName: 'Canyon Classic at ECR',
  trackName: 'Eagles Canyon Raceway',
  trackLength: '2.7 mi · 15 turns',
  runId: 'demo',
  runName: 'Groups 2 & 7 · Test & Tune',
  sessionMode: 'practice',
  flag: 'GREEN',
  lapsToGo: null,
  timeToGo: '18:42',
  timeOfDay: '08:19:35',
  raceTime: '00:16:07.400',
  initializedAt: new Date().toISOString(),
  classes: [{ id: 1, name: 'FF2' }, { id: 2, name: 'FF1' }, { id: 3, name: 'FF3' }],
  groups: ['Group 6'],
  settings: { TRACKNAME: 'Eagles Canyon Raceway', TRACKLENGTH: '2.750' },
  source: { protocol: 'RMonitor', recordsCaptured: 160, commandCounts: { '$A': 35, '$C': 7, '$F': 10 } },
  updatedAt: new Date().toISOString(),
  cars: [
    { position: 1, registrationNumber: 'CVAR65', number: '65', driver: 'Sam LeComte', car: '1965 Lotus 23B', groupName: 'Group 6', classNumber: 1, className: 'FF2', laps: 8, bestLapNumber: 7, latestLapNumber: 8, latestScoreType: 'SP', totalTime: '16:19.204', lastLap: '2:02.418', bestLap: '2:00.871', gap: '—' },
    { position: 2, registrationNumber: 'CVAR14', number: '14', driver: 'Morgan Ellis', car: '1972 Porsche 914', groupName: 'Group 6', classNumber: 2, className: 'FF1', laps: 8, bestLapNumber: 6, latestLapNumber: 8, latestScoreType: 'SP', totalTime: '16:22.118', lastLap: '2:03.026', bestLap: '2:01.442', gap: '+0.571' },
    { position: 3, registrationNumber: 'CVAR42', number: '42', driver: 'Alex Rivera', car: '1967 Alfa Romeo GTV', groupName: 'Group 6', classNumber: 1, className: 'FF2', laps: 8, bestLapNumber: 5, latestLapNumber: 8, latestScoreType: 'SP', totalTime: '16:25.477', lastLap: '2:04.119', bestLap: '2:02.205', gap: '+1.334' },
    { position: 4, registrationNumber: 'CVAR711', number: '711', driver: 'Chris Walker', car: '1971 Datsun 240Z', groupName: 'Group 6', classNumber: 2, className: 'FF1', laps: 7, bestLapNumber: 5, latestLapNumber: 7, latestScoreType: 'SP', totalTime: '14:19.804', lastLap: '2:02.997', bestLap: '2:02.611', gap: '+1.740' },
    { position: 5, registrationNumber: 'CVAR88', number: '88', driver: 'Taylor Reed', car: '1969 Triumph GT6', groupName: 'Group 6', classNumber: 3, className: 'FF3', laps: 7, bestLapNumber: 4, latestLapNumber: 7, latestScoreType: 'SP', totalTime: '14:47.332', lastLap: '2:08.312', bestLap: '2:06.774', gap: '+5.903' },
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

export function rankSnapshotByBestLap(snapshot: TimingSnapshot): TimingSnapshot {
  const ranked = [...snapshot.cars].sort((left, right) => {
    const leftTime = lapTimeToMilliseconds(left.bestLap);
    const rightTime = lapTimeToMilliseconds(right.bestLap);
    if (leftTime !== rightTime) return leftTime - rightTime;
    return left.position - right.position;
  });
  const leaderTime = ranked.length ? lapTimeToMilliseconds(ranked[0].bestLap) : Number.POSITIVE_INFINITY;

  return {
    ...snapshot,
    cars: ranked.map((car, index) => {
      const carTime = lapTimeToMilliseconds(car.bestLap);
      const hasGap = Number.isFinite(leaderTime) && Number.isFinite(carTime);
      return {
        ...car,
        position: index + 1,
        gap: index === 0 ? '—' : hasGap ? `+${((carTime - leaderTime) / 1000).toFixed(3)}` : '',
      };
    }),
  };
}

export function formatSessionName(value: string) {
  const match = value.match(/^Gp([0-9,]+)-([^=]+)(?:=(.+))?$/i);
  if (!match) return value;
  const groups = match[1].split(',');
  const groupLabel = groups.length === 1 ? `Group ${groups[0]}` : `Groups ${groups.slice(0, -1).join(', ')} & ${groups.at(-1)}`;
  const sessionLabel = (match[3] || match[2])
    .replace(/^TT(\d+)$/i, 'Test & Tune $1')
    .replace(/^R(\d+)$/i, 'Race $1')
    .replace(/^PQ$/i, 'Practice / Qualifying');
  return `${groupLabel} · ${sessionLabel}`;
}

export function formatTrackPrimary(value: string) {
  const distance = value.split('·')[0]?.trim() || '2.7 mi';
  const match = distance.match(/^(\d+(?:\.\d+)?)\s*(?:mi|miles?)?$/i);
  if (!match) return distance;
  return `${Number(match[1]).toLocaleString('en-US', { maximumFractionDigits: 3 })} mi`;
}

export function formatTrackDetail(value: string, trackName = '') {
  const detail = value.split('·')[1]?.trim();
  if (detail) return detail;
  if (/eagles canyon/i.test(trackName)) return '15 turns';
  return 'Start / finish loop';
}

export function formatTrackSummary(value: string, trackName = '') {
  return `${formatTrackPrimary(value)} · ${formatTrackDetail(value, trackName)}`;
}

function lapTimeToMilliseconds(value: string) {
  if (!value) return Number.POSITIVE_INFINITY;
  const parts = value.split(':');
  const seconds = Number(parts.pop());
  if (!Number.isFinite(seconds)) return Number.POSITIVE_INFINITY;
  const minutes = Number(parts.pop() || 0);
  const hours = Number(parts.pop() || 0);
  if (!Number.isFinite(minutes) || !Number.isFinite(hours)) return Number.POSITIVE_INFINITY;
  return ((hours * 60 + minutes) * 60 + seconds) * 1000;
}
