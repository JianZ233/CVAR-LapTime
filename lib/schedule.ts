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

export const eventSchedule: ScheduleDay[] = [
  {
    day: 'Friday',
    date: 'September 11',
    items: [
      { title: 'Mandatory Drivers Meeting', time: '7:00 AM', kind: 'meeting' },
      { title: 'Marshal Meeting', time: '7:15 AM', kind: 'meeting' },
      { title: 'Anthem', time: '7:55 AM', kind: 'meeting' },
      {
        title: 'Group 6',
        time: '8:00–8:15 AM',
        duration: 'Test & Tune · 15 min',
        kind: 'track',
      },
      {
        title: 'Group 1',
        time: '8:20–8:35 AM',
        duration: 'Test & Tune · 15 min',
        kind: 'track',
      },
      {
        title: 'Groups 2 & 7',
        time: '8:40–8:55 AM',
        duration: 'Test & Tune · 15 min',
        kind: 'track',
      },
      {
        title: 'Group 3',
        time: '9:00–9:15 AM',
        duration: 'Test & Tune · 15 min',
        kind: 'track',
      },
      {
        title: 'Group 4',
        time: '9:20–9:35 AM',
        duration: 'Test & Tune · 15 min',
        kind: 'track',
      },
      {
        title: 'Group 6',
        time: '9:40–9:55 AM',
        duration: 'Test & Tune · 15 min',
        kind: 'track',
      },
      {
        title: 'Group 1',
        time: '10:00–10:15 AM',
        duration: 'Test & Tune · 15 min',
        kind: 'track',
      },
      {
        title: 'Groups 2 & 7',
        time: '10:20–10:35 AM',
        duration: 'Test & Tune · 15 min',
        kind: 'track',
      },
      {
        title: 'Group 3',
        time: '10:40–10:55 AM',
        duration: 'Test & Tune · 15 min',
        kind: 'track',
      },
      {
        title: 'Group 4',
        time: '11:00–11:15 AM',
        duration: 'Test & Tune · 15 min',
        kind: 'track',
      },
      { title: 'Lunch', time: '11:25 AM–12:25 PM', kind: 'break' },
      {
        title: 'Open Wheel',
        time: '12:35–12:47 PM',
        duration: 'Lead Follow · 12 min',
        kind: 'track',
      },
      {
        title: 'Closed Wheel',
        time: '12:52–1:04 PM',
        duration: 'Lead Follow · 12 min',
        kind: 'track',
      },
      {
        title: 'Group 6',
        time: '1:10–1:25 PM',
        duration: 'Test & Tune · 15 min',
        kind: 'track',
      },
      {
        title: 'Group 1',
        time: '1:30–1:45 PM',
        duration: 'Test & Tune · 15 min',
        kind: 'track',
      },
      {
        title: 'Groups 2 & 7',
        time: '1:50–2:05 PM',
        duration: 'Test & Tune · 15 min',
        kind: 'track',
      },
      {
        title: 'Group 3',
        time: '2:10–2:25 PM',
        duration: 'Test & Tune · 15 min',
        kind: 'track',
      },
      {
        title: 'Group 4',
        time: '2:30–2:45 PM',
        duration: 'Test & Tune · 15 min',
        kind: 'track',
      },
      {
        title: 'Group 6',
        time: '2:50–3:05 PM',
        duration: 'Test & Tune · 15 min',
        kind: 'track',
      },
      {
        title: 'Group 1',
        time: '3:10–3:25 PM',
        duration: 'Test & Tune · 15 min',
        kind: 'track',
      },
      {
        title: 'Groups 2 & 7',
        time: '3:30–3:45 PM',
        duration: 'Test & Tune · 15 min',
        kind: 'track',
      },
      {
        title: 'Group 3',
        time: '3:50–4:05 PM',
        duration: 'Test & Tune · 15 min',
        kind: 'track',
      },
      {
        title: 'Group 4',
        time: '4:10–4:25 PM',
        duration: 'Test & Tune · 15 min',
        kind: 'track',
      },
      {
        title: 'Decatur Square Car Show',
        time: '4:30 PM',
        note: 'Line up at the guard shack for police escort. Leave promptly at 5:00 PM.',
        kind: 'social',
      },
    ],
  },
  {
    day: 'Saturday',
    date: 'September 12',
    items: [
      { title: 'Mandatory Drivers Meeting', time: '7:00 AM', kind: 'meeting' },
      { title: 'Marshal Meeting', time: '7:15 AM', kind: 'meeting' },
      { title: 'Anthem', time: '7:55 AM', kind: 'meeting' },
      {
        title: 'Group 6',
        time: '8:00–8:10 AM',
        duration: 'Practice & Qualifying · 10 min',
        kind: 'track',
      },
      {
        title: 'Screaming Eagles Drivers Meeting',
        time: '8:15 AM',
        kind: 'meeting',
      },
      {
        title: 'Group 1',
        time: '8:15–8:25 AM',
        duration: 'Practice & Qualifying · 10 min',
        kind: 'track',
      },
      {
        title: 'Groups 2 & 7',
        time: '8:30–8:40 AM',
        duration: 'Practice & Qualifying · 10 min',
        kind: 'track',
      },
      {
        title: 'Group 3',
        time: '8:45–8:55 AM',
        duration: 'Practice & Qualifying · 10 min',
        kind: 'track',
      },
      {
        title: 'Group 4',
        time: '9:00–9:10 AM',
        duration: 'Practice & Qualifying · 10 min',
        kind: 'track',
      },
      {
        title: 'SE Group',
        time: '9:15–9:35 AM',
        duration: 'Practice & Qualifying · 20 min',
        kind: 'track',
      },
      {
        title: 'Group 6',
        time: '9:45–10:03 AM',
        duration: 'Race 1 · 18 min',
        kind: 'track',
      },
      {
        title: 'Group 1',
        time: '10:23–10:41 AM',
        duration: 'Race 1 · 18 min',
        kind: 'track',
      },
      {
        title: 'Groups 2 & 7',
        time: '10:51–11:09 AM',
        duration: 'Race 1 · 18 min',
        kind: 'track',
      },
      {
        title: 'Group 3',
        time: '11:19–11:37 AM',
        duration: 'Race 1 · 18 min',
        kind: 'track',
      },
      {
        title: 'Group 4',
        time: '11:47 AM–12:05 PM',
        duration: 'Race 1 · 18 min',
        kind: 'track',
      },
      {
        title: 'SE Group',
        time: '12:10–12:30 PM',
        duration: 'Race 1 · 20 min',
        kind: 'track',
      },
      { title: 'Lunch', time: '12:40–1:40 PM', kind: 'break' },
      { title: 'Horsepower4Heroes Drive Around', kind: 'social' },
      {
        title: 'Canyon Cup Race',
        time: '1:50–2:10 PM',
        duration: '20 min',
        note: 'For cars 1.7L and up. Must sign up before the race.',
        kind: 'track',
      },
      {
        title: 'Group 6',
        time: '2:20–2:40 PM',
        duration: 'Race 2 · 20 min',
        kind: 'track',
      },
      {
        title: 'Group 3',
        time: '2:50–3:10 PM',
        duration: 'Race 2 · 20 min',
        kind: 'track',
      },
      {
        title: 'Groups 2 & 7',
        time: '3:20–3:40 PM',
        duration: 'Race 2 · 20 min',
        kind: 'track',
      },
      {
        title: 'Group 4',
        time: '3:50–4:10 PM',
        duration: 'Race 2 · 20 min',
        kind: 'track',
      },
      {
        title: 'Group 1',
        time: '4:20–4:40 PM',
        duration: 'Race 2 · 20 min',
        kind: 'track',
      },
      {
        title: 'SE Group',
        time: '4:50–5:15 PM',
        duration: 'Race 2 · 25 min',
        kind: 'track',
      },
      {
        title: 'Party and Awards',
        time: '6:00 PM',
        note: 'At the Pavilion.',
        kind: 'social',
      },
    ],
  },
  {
    day: 'Sunday',
    date: 'September 13',
    items: [
      { title: 'Marshal Meeting', time: '7:15 AM', kind: 'meeting' },
      { title: 'Anthem', time: '7:55 AM', kind: 'meeting' },
      {
        title: 'Hardship Session',
        time: '8:00 AM',
        duration: '2 laps',
        kind: 'track',
      },
      {
        title: 'Race 3 – Points races begin',
        time: '8:15 AM',
        duration: '20 min',
        kind: 'track',
      },
      {
        title: 'Group 6',
        time: '8:25–8:45 AM',
        duration: 'Race 3 · 20 min',
        kind: 'track',
      },
      {
        title: 'Group 1',
        time: '9:05–9:25 AM',
        duration: 'Race 3 · 20 min',
        kind: 'track',
      },
      {
        title: 'Groups 2 & 7',
        time: '9:45–10:05 AM',
        duration: 'Race 3 · 20 min',
        kind: 'track',
      },
      {
        title: 'Group 3',
        time: '10:25–10:45 AM',
        duration: 'Race 3 · 20 min',
        kind: 'track',
      },
      {
        title: 'Group 4',
        time: '11:05–11:25 AM',
        duration: 'Race 3 · 20 min',
        kind: 'track',
      },
      { title: 'Lunch', time: '11:55 AM–12:55 PM', kind: 'break' },
      {
        title: 'Group 6',
        time: '1:05–1:25 PM',
        duration: 'Race 4 · 20 min',
        kind: 'track',
      },
      {
        title: 'Group 1',
        time: '1:35–1:55 PM',
        duration: 'Race 4 · 20 min',
        kind: 'track',
      },
      {
        title: 'Groups 2 & 7',
        time: '2:05–2:25 PM',
        duration: 'Race 4 · 20 min',
        kind: 'track',
      },
      {
        title: 'Group 3',
        time: '2:35–2:55 PM',
        duration: 'Race 4 · 20 min',
        kind: 'track',
      },
      {
        title: 'Group 4',
        time: '3:05–3:25 PM',
        duration: 'Race 4 · 20 min',
        kind: 'track',
      },
      {
        title: 'Screaming Eagles',
        note: 'SE Group includes Spec Boxster, Spec Miata, and Toyota GR86.',
        kind: 'track',
      },
      {
        title: 'Operations Notes',
        note: 'Drivers meeting: Clubhouse. Worker meeting: Grid. Grid calls: text, PA, and 464.5000.',
        kind: 'meeting',
      },
    ],
  },
];
