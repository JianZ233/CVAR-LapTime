type ManualResultRow = {
  position: number;
  number: string;
  driver: string;
  className: string;
  laps: number;
  totalTime: string;
  bestLap: string;
  points: number;
};

type ResultCar = Record<string, unknown> & {
  registrationKey?: string;
  registrationNumber?: string;
  number?: string;
};

type ResultSnapshot = Record<string, unknown> & {
  cars: ResultCar[];
  source?: Record<string, unknown>;
};

const GROUP_6_RACE_4_SESSION = '2026-09-13-63-gp6-r4-race-4';

// Transcribed from the uploaded CVAR Group 6 - Race 4 result sheet.
const GROUP_6_RACE_4_RESULTS: ManualResultRow[] = [
  {
    position: 1,
    number: '88',
    driver: 'Tom Dalrymple',
    className: 'FF2',
    laps: 7,
    totalTime: '16:04.611',
    bestLap: '02:04.224',
    points: 2,
  },
  {
    position: 2,
    number: '64bk',
    driver: 'Ian Schoen',
    className: 'FF2',
    laps: 7,
    totalTime: '16:11.883',
    bestLap: '02:06.347',
    points: 2,
  },
  {
    position: 3,
    number: '777',
    driver: 'Caleb Hamm',
    className: 'FF2',
    laps: 7,
    totalTime: '16:18.544',
    bestLap: '02:04.739',
    points: 2,
  },
  {
    position: 4,
    number: '291',
    driver: 'Kim Madrid',
    className: 'FF2',
    laps: 7,
    totalTime: '16:18.727',
    bestLap: '02:07.837',
    points: 2,
  },
  {
    position: 5,
    number: '68',
    driver: 'Ty Coffey',
    className: 'FF3',
    laps: 7,
    totalTime: '16:29.238',
    bestLap: '02:08.339',
    points: 2,
  },
  {
    position: 6,
    number: '23bl',
    driver: 'Charles Jones',
    className: 'FF1',
    laps: 7,
    totalTime: '16:30.486',
    bestLap: '02:10.916',
    points: 2,
  },
  {
    position: 7,
    number: '49',
    driver: 'Kevin Ford',
    className: 'FF1',
    laps: 7,
    totalTime: '16:30.848',
    bestLap: '02:10.214',
    points: 2,
  },
  {
    position: 8,
    number: '71',
    driver: 'Patrick Slater',
    className: 'FF1',
    laps: 7,
    totalTime: '16:31.900',
    bestLap: '02:10.707',
    points: 2,
  },
  {
    position: 9,
    number: '02',
    driver: 'Jeff Neathery',
    className: 'FF1',
    laps: 7,
    totalTime: '16:43.306',
    bestLap: '02:12.674',
    points: 2,
  },
  {
    position: 10,
    number: '23r',
    driver: 'Pete Christensen',
    className: 'FF1',
    laps: 7,
    totalTime: '16:43.670',
    bestLap: '02:12.440',
    points: 2,
  },
  {
    position: 11,
    number: '7',
    driver: 'Mike Swensen',
    className: 'FF2',
    laps: 7,
    totalTime: '17:04.238',
    bestLap: '02:17.569',
    points: 2,
  },
  {
    position: 12,
    number: '25',
    driver: 'Willis Murphey',
    className: 'FF3',
    laps: 7,
    totalTime: '17:19.352',
    bestLap: '02:19.741',
    points: 2,
  },
  {
    position: 13,
    number: '111',
    driver: 'Andrea Samudio',
    className: 'FF2',
    laps: 7,
    totalTime: '17:19.923',
    bestLap: '02:19.729',
    points: 2,
  },
  {
    position: 14,
    number: '28',
    driver: 'Thomas Searls',
    className: 'FF2',
    laps: 7,
    totalTime: '17:27.156',
    bestLap: '02:20.750',
    points: 2,
  },
  {
    position: 15,
    number: '16w',
    driver: 'David Cheever',
    className: 'FF1',
    laps: 7,
    totalTime: '17:29.763',
    bestLap: '02:22.455',
    points: 2,
  },
  {
    position: 16,
    number: '64r',
    driver: 'Charles Bamford',
    className: 'FF2',
    laps: 7,
    totalTime: '17:43.300',
    bestLap: '02:25.680',
    points: 2,
  },
  {
    position: 17,
    number: '64y',
    driver: 'Enrique Contreras',
    className: 'FF2',
    laps: 6,
    totalTime: '14:09.743',
    bestLap: '02:07.669',
    points: 2,
  },
  {
    position: 18,
    number: '99',
    driver: 'Scott Clark',
    className: 'FF3',
    laps: 4,
    totalTime: '09:50.429',
    bestLap: '02:07.737',
    points: 2,
  },
  {
    position: 19,
    number: '73',
    driver: 'Jeffrey Garrett',
    className: 'FF2',
    laps: 1,
    totalTime: '02:14.607',
    bestLap: '02:14.065',
    points: 2,
  },
  {
    position: 20,
    number: '20',
    driver: 'Joe Kubizniak',
    className: 'FF2',
    laps: 1,
    totalTime: '02:15.168',
    bestLap: '02:14.340',
    points: 2,
  },
  {
    position: 21,
    number: '29',
    driver: 'Patrick Flynn',
    className: 'FF1',
    laps: 0,
    totalTime: '',
    bestLap: '',
    points: 0,
  },
  {
    position: 22,
    number: '46',
    driver: 'Ted Smith',
    className: 'FF3',
    laps: 0,
    totalTime: '',
    bestLap: '',
    points: 0,
  },
  {
    position: 23,
    number: '66',
    driver: 'Tim Blakeley',
    className: 'FF2',
    laps: 0,
    totalTime: '',
    bestLap: '',
    points: 0,
  },
  {
    position: 24,
    number: '4',
    driver: 'Mac Wolff',
    className: 'FF2',
    laps: 0,
    totalTime: '',
    bestLap: '',
    points: 0,
  },
  {
    position: 25,
    number: '3',
    driver: 'Maurice Griffin',
    className: 'FF1',
    laps: 0,
    totalTime: '',
    bestLap: '',
    points: 0,
  },
  {
    position: 26,
    number: '18',
    driver: 'Dylan Schrader',
    className: 'FC',
    laps: 0,
    totalTime: '',
    bestLap: '',
    points: 0,
  },
  {
    position: 27,
    number: '63',
    driver: 'Paul Haggar',
    className: 'FB',
    laps: 0,
    totalTime: '',
    bestLap: '',
    points: 0,
  },
  {
    position: 28,
    number: '31',
    driver: 'William Trimbur',
    className: 'FF2000',
    laps: 0,
    totalTime: '',
    bestLap: '',
    points: 0,
  },
  {
    position: 29,
    number: '78',
    driver: 'Tim Blakeney',
    className: 'FA',
    laps: 0,
    totalTime: '',
    bestLap: '',
    points: 0,
  },
];

const CLASS_NUMBERS = new Map([
  ['FF2', 1],
  ['FF1', 2],
  ['FF3', 3],
  ['FC', 4],
  ['FB', 5],
  ['FF2000', 6],
  ['FA', 7],
]);

export function applyManualSessionResult(
  sessionId: string,
  snapshot: ResultSnapshot,
) {
  if (sessionId !== GROUP_6_RACE_4_SESSION) return snapshot;

  const storedCars = new Map(
    snapshot.cars.map((car) => [String(car.number || '').toLowerCase(), car]),
  );

  return {
    ...snapshot,
    sessionMode: 'race',
    flag: 'FINISH',
    lapsToGo: 0,
    timeToGo: '00:00',
    raceTime: '16:04.611',
    source: {
      ...snapshot.source,
      manualResult: 'group-6-race-4-results.pdf',
    },
    cars: GROUP_6_RACE_4_RESULTS.map((result) => {
      const stored = storedCars.get(result.number.toLowerCase()) || {};
      return {
        ...stored,
        registrationKey:
          String(stored.registrationKey || stored.registrationNumber || '') ||
          result.number,
        registrationNumber:
          String(stored.registrationNumber || '') || result.number,
        number: result.number,
        driver: result.driver,
        groupName: 'Group 6',
        classNumber: CLASS_NUMBERS.get(result.className) || null,
        className: result.className,
        position: result.position,
        racePosition: result.position,
        positionChange: 0,
        laps: result.laps,
        latestLapNumber: result.laps,
        totalTime: result.totalTime,
        bestLap: result.bestLap,
        points: result.points,
      };
    }),
  };
}
