export type TimingCar = {
  registrationNumber: string;
  number: string;
  driver: string;
  car: string;
  className: string;
  position: number;
  laps: number;
  totalTime: string;
  lastLap: string;
  bestLap: string;
  gap: string;
};

export type TimingSnapshot = {
  eventName: string;
  trackName: string;
  trackLength: string;
  runName: string;
  sessionMode: 'race' | 'practice';
  flag: string;
  lapsToGo: number | null;
  timeToGo: string;
  updatedAt: string;
  cars: TimingCar[];
};

export const demoSnapshot: TimingSnapshot = {
  eventName: 'Canyon Classic at ECR',
  trackName: 'Eagles Canyon Raceway',
  trackLength: '2.7 mi · 15 turns',
  runName: 'Groups 2 & 7 · Test & Tune',
  sessionMode: 'practice',
  flag: 'GREEN',
  lapsToGo: null,
  timeToGo: '18:42',
  updatedAt: new Date().toISOString(),
  cars: [
    { position: 1, registrationNumber: 'CVAR65', number: '65', driver: 'Sam LeComte', car: '1965 Lotus 23B', className: 'Group 7', laps: 8, totalTime: '16:19.204', lastLap: '2:02.418', bestLap: '2:00.871', gap: '—' },
    { position: 2, registrationNumber: 'CVAR14', number: '14', driver: 'Morgan Ellis', car: '1972 Porsche 914', className: 'Group 7', laps: 8, totalTime: '16:22.118', lastLap: '2:03.026', bestLap: '2:01.442', gap: '+0.571' },
    { position: 3, registrationNumber: 'CVAR42', number: '42', driver: 'Alex Rivera', car: '1967 Alfa Romeo GTV', className: 'Group 2', laps: 8, totalTime: '16:25.477', lastLap: '2:04.119', bestLap: '2:02.205', gap: '+1.334' },
    { position: 4, registrationNumber: 'CVAR711', number: '711', driver: 'Chris Walker', car: '1971 Datsun 240Z', className: 'Group 2', laps: 7, totalTime: '14:19.804', lastLap: '2:02.997', bestLap: '2:02.611', gap: '+1.740' },
    { position: 5, registrationNumber: 'CVAR88', number: '88', driver: 'Taylor Reed', car: '1969 Triumph GT6', className: 'Group 3', laps: 7, totalTime: '14:47.332', lastLap: '2:08.312', bestLap: '2:06.774', gap: '+5.903' },
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
