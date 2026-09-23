export type ScheduleItem = {
  title: string;
  time?: string;
  duration?: string;
  groups?: string[];
  note?: string;
  kind?: 'track' | 'meeting' | 'break' | 'social';
};

export type ScheduleDay = {
  day: string;
  date: string;
  items: ScheduleItem[];
};

const fridayRunOrder = [
  'Group 3',
  'Group 6',
  'Group 1',
  'Groups 2 & 7',
  'Group 4',
];

const raceRunOrder = [
  'Group 4',
  'Group 6',
  'Group 1',
  'Groups 2 & 7',
  'Group 3',
];

export const eventSchedule: ScheduleDay[] = [
  {
    day: 'Friday',
    date: 'October 9',
    items: [
      { title: 'Mandatory Drivers Meeting', time: '7:00 AM', kind: 'meeting' },
      { title: 'Marshal Meeting', time: '7:15 AM', kind: 'meeting' },
      { title: 'Anthem', time: '7:55 AM', kind: 'meeting' },
      {
        title: 'Test & Tune',
        time: '8:00 AM',
        duration: '15 minutes per group',
        groups: fridayRunOrder,
        kind: 'track',
      },
      {
        title: 'Test & Tune',
        duration: '15 minutes per group',
        groups: fridayRunOrder,
        kind: 'track',
      },
      { title: 'Lunch', kind: 'break' },
      {
        title: 'Lead Follow Sessions',
        duration: '12 minutes per group',
        groups: ['Open Wheel', 'Closed Wheel'],
        kind: 'track',
      },
      {
        title: 'Test & Tune',
        duration: '15 minutes per group',
        groups: fridayRunOrder,
        kind: 'track',
      },
      {
        title: 'Test & Tune',
        duration: '15 minutes per group',
        groups: fridayRunOrder,
        kind: 'track',
      },
      {
        title: 'Formula Vee Feature',
        duration: '20 minutes',
        kind: 'track',
      },
    ],
  },
  {
    day: 'Saturday',
    date: 'October 10',
    items: [
      { title: 'Mandatory Drivers Meeting', time: '7:00 AM', kind: 'meeting' },
      { title: 'Marshal Meeting', time: '7:15 AM', kind: 'meeting' },
      { title: 'Anthem', time: '7:55 AM', kind: 'meeting' },
      {
        title: 'Practice & Qualifying',
        time: '8:00 AM',
        duration: '15 minutes per group',
        groups: raceRunOrder,
        kind: 'track',
      },
      {
        title: 'Race 1',
        duration: '20 minutes per group',
        groups: raceRunOrder,
        kind: 'track',
      },
      { title: 'Lunch', kind: 'break' },
      {
        title: 'Race 2',
        duration: '20 minutes per group',
        groups: raceRunOrder,
        kind: 'track',
      },
      {
        title: 'Bulova Formula Ford Feature',
        duration: '20 minutes',
        kind: 'track',
      },
      {
        title: 'Party at the Pavilion',
        kind: 'social',
      },
    ],
  },
  {
    day: 'Sunday',
    date: 'October 11',
    items: [
      { title: 'Marshal Meeting', time: '7:15 AM', kind: 'meeting' },
      { title: 'Anthem', time: '7:55 AM', kind: 'meeting' },
      {
        title: 'Hardship',
        time: '8:00 AM',
        duration: '2 laps',
        kind: 'track',
      },
      {
        title: 'Race 3 - Points',
        time: '8:15 AM',
        duration: '20 minutes per group',
        groups: raceRunOrder,
        kind: 'track',
      },
      { title: 'Lunch', kind: 'break' },
      {
        title: 'Race 4',
        duration: '20 minutes per group',
        groups: raceRunOrder,
        kind: 'track',
      },
      {
        title: 'Operations Notes',
        note: 'Drivers meeting: Pavilion. Marshal meeting: 2nd Floor Tower. Grid calls: text, PA, and 464.5000.',
        kind: 'meeting',
      },
    ],
  },
];
