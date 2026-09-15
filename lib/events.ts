export const CURRENT_EVENT_ID = 'mike-stephens-classic-2026';
export const ARCHIVE_EVENT_ID = 'canyon-classic-2026';

export const currentEvent = {
  id: CURRENT_EVENT_ID,
  name: '20th Annual Mike Stephens Classic',
  shortName: 'Mike Stephens Classic',
  dates: 'October 9–11, 2026',
  trackName: 'Hallett Motor Racing Circuit',
  trackLength: '1.8 mi · 10 turns',
} as const;

export const archivedEvent = {
  id: ARCHIVE_EVENT_ID,
  name: 'Canyon Classic at ECR',
  shortName: 'Canyon Classic',
  dates: 'September 11–13, 2026',
  trackName: 'Eagles Canyon Raceway',
  scheduleHref: '/ECR-Fall-2026-Schedule.pdf',
} as const;
