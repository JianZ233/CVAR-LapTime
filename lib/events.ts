export const CURRENT_EVENT_ID = 'mike-stephens-classic-2026';
export const ARCHIVE_EVENT_ID = 'canyon-classic-2026';

export const currentEvent = {
  id: CURRENT_EVENT_ID,
  name: '20th Annual Mike Stephens Classic',
  shortName: 'Mike Stephens Classic',
  dates: 'October 9–11, 2026',
  shortDates: 'Oct 9–11',
  // First session (Friday Test & Tune) and a conservative end of Sunday.
  startsAt: '2026-10-09T08:00:00-05:00',
  endsAt: '2026-10-11T19:00:00-05:00',
  trackName: 'Hallett Motor Racing Circuit',
  location: 'Jennings, Oklahoma',
  trackLength: '1.8 mi · 10 turns',
  scheduleHref: '/Hallett-Fall-2026-Schedule.pdf',
  registrationHref:
    'https://cvar.trackrabbit.com/event/details/10019666-Mike-Stephens-Classic-2026-10-09',
  eventPageHref:
    'https://corinthianvintageautoracing.com/2026-race-calendar/mike-stephens-classic/',
} as const;

export const archivedEvent = {
  id: ARCHIVE_EVENT_ID,
  name: 'Canyon Classic at ECR',
  shortName: 'Canyon Classic',
  dates: 'September 11–13, 2026',
  shortDates: 'Sep 11–13',
  trackName: 'Eagles Canyon Raceway',
  scheduleHref: '/ECR-Fall-2026-Schedule.pdf',
} as const;
