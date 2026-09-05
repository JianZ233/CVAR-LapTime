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

const standardGroups = ['Group 6', 'Group 1', 'Groups 2 & 7', 'Group 3', 'Group 4'];

export const eventSchedule: ScheduleDay[] = [
  {
    day: 'Friday',
    date: 'September 11',
    items: [
      { title: 'Mandatory Drivers Meeting', time: '7:00 AM', kind: 'meeting' },
      { title: 'Marshal Meeting', time: '7:15 AM', kind: 'meeting' },
      { title: 'Anthem', time: '7:55 AM', kind: 'meeting' },
      { title: 'Test & Tune', time: '8:00 AM', duration: '18 minutes', groups: standardGroups, kind: 'track' },
      { title: 'Test & Tune', duration: '18 minutes', groups: standardGroups, kind: 'track' },
      { title: 'Lunch', time: '11:55 AM - 12:55 PM', kind: 'break' },
      { title: 'Lead Follow Sessions', duration: '12 minutes', groups: ['Open Wheel', 'Closed Wheel'], kind: 'track' },
      { title: 'Test & Tune', duration: '15 minutes', groups: standardGroups, kind: 'track' },
      { title: 'Test & Tune', duration: '15 minutes', groups: standardGroups, kind: 'track' },
      { title: 'Decatur Square Car Show', time: '4:30 PM', note: 'Line up at the guard shack for police escort. Leave promptly at 5:00 PM.', kind: 'social' },
    ],
  },
  {
    day: 'Saturday',
    date: 'September 12',
    items: [
      { title: 'Mandatory Drivers Meeting', time: '7:00 AM', kind: 'meeting' },
      { title: 'Marshal Meeting', time: '7:15 AM', kind: 'meeting' },
      { title: 'Anthem', time: '7:55 AM', kind: 'meeting' },
      { title: 'Practice & Qualifying', time: '8:00 AM', duration: '10 minutes', groups: [...standardGroups, 'Screaming Eagles'], kind: 'track' },
      { title: 'Screaming Eagles Drivers Meeting', time: '8:15 AM', kind: 'meeting' },
      { title: 'Race 1', duration: '18 minutes', groups: [...standardGroups, 'Screaming Eagles'], kind: 'track' },
      { title: 'Lunch', time: '12:40 PM - 1:40 PM', kind: 'break' },
      { title: 'Horsepower4Heroes Drive Around', kind: 'social' },
      { title: 'Canyon Cup Race', time: '1:50 PM - 2:10 PM', duration: '20 minutes', note: 'For cars 1.7L and up. Must sign up before the race.', kind: 'track' },
      { title: 'Race 2', duration: '20 minutes', groups: ['Group 6', 'Group 3', 'Groups 2 & 7', 'Group 4', 'Group 1', 'Screaming Eagles'], kind: 'track' },
      { title: 'Party and Awards', time: '6:00 PM', note: 'At the Pavilion.', kind: 'social' },
    ],
  },
  {
    day: 'Sunday',
    date: 'September 13',
    items: [
      { title: 'Marshal Meeting', time: '7:15 AM', kind: 'meeting' },
      { title: 'Anthem', time: '7:55 AM', kind: 'meeting' },
      { title: 'Hardship Session', time: '8:00 AM', duration: '2 laps', kind: 'track' },
      { title: 'Race 3 - Points Race', time: '8:15 AM', duration: '20 minutes', groups: standardGroups, kind: 'track' },
      { title: 'Lunch', time: '11:55 AM - 12:55 PM', kind: 'break' },
      { title: 'Race 4', duration: '20 minutes', groups: standardGroups, kind: 'track' },
      { title: 'Screaming Eagles', note: 'Spec Boxster, Spec Miata, and Toyota GR86.', kind: 'track' },
      { title: 'Operations Notes', note: 'Drivers meeting: Clubhouse. Worker meeting: Grid. Grid calls: text, PA, and 464.5000.', kind: 'meeting' },
    ],
  },
];
