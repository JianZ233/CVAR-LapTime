import { currentEvent } from '@/lib/events';
import {
  formatSessionName,
  lapTimeToMilliseconds,
  type TimingCar,
  type TimingSnapshot,
} from '@/lib/timing';

export type FeedState = 'demo' | 'live' | 'stale' | 'history';

export type TimingSessionSummary = {
  id: string;
  startedAt: string;
  runId: string;
  runName: string;
  flag: string;
  groups: string[];
  carCount: number;
  updatedAt: string;
};

export type FlagTone =
  | 'green'
  | 'yellow'
  | 'red'
  | 'blue'
  | 'white'
  | 'black'
  | 'checkered'
  | 'inactive';

// Both CVAR tracks run on Central time, so session times and race days are
// shown in track time regardless of where the viewer is.
export const TRACK_TIME_ZONE = 'America/Chicago';

const FINISH_FLAGS = ['FINISH', 'FINISHED', 'CHECKERED', 'CHEQUERED'];

export function flagTone(value: string): FlagTone {
  const flag = value.trim().toLowerCase();
  if (flag.includes('yellow')) return 'yellow';
  if (flag.includes('red')) return 'red';
  if (flag.includes('blue')) return 'blue';
  if (flag.includes('white')) return 'white';
  if (flag.includes('black')) return 'black';
  if (/finish|checkered|chequered/.test(flag)) return 'checkered';
  if (flag.includes('green')) return 'green';
  return 'inactive';
}

export function flagLabel(value: string) {
  const flag = value.trim().toUpperCase();
  if (!flag || flag === 'NOT ACTIVE') return 'Not active';
  if (FINISH_FLAGS.includes(flag)) return 'Checkered';
  return flag.charAt(0) + flag.slice(1).toLowerCase();
}

export function raceIsFinished(value: string) {
  const flag = value.trim().toLowerCase();
  return flag === 'not active' || /finish|checkered|chequered/.test(flag);
}

export function sessionClock(
  snapshot: TimingSnapshot,
  feedState: FeedState,
  secondsAgo: number,
): { value: string; label: string } {
  if (feedState === 'history')
    return snapshot.raceTime
      ? { value: shortTime(snapshot.raceTime), label: 'Elapsed' }
      : { value: 'Done', label: 'Completed session' };
  if (FINISH_FLAGS.includes(snapshot.flag))
    return snapshot.raceTime
      ? { value: shortTime(snapshot.raceTime), label: 'Finished · elapsed' }
      : { value: 'Done', label: 'Session finished' };
  if (snapshot.flag === 'NOT ACTIVE')
    return { value: '—', label: 'Session not active' };
  if (snapshot.timeToGo) {
    const shouldTick =
      feedState === 'live' && ['GREEN', 'YELLOW'].includes(snapshot.flag);
    return {
      value: shouldTick
        ? countdownTime(snapshot.timeToGo, secondsAgo)
        : shortTime(snapshot.timeToGo),
      label: 'Remaining',
    };
  }
  if (snapshot.lapsToGo !== null && snapshot.lapsToGo < 9_999)
    return {
      value: String(snapshot.lapsToGo),
      label: snapshot.lapsToGo === 1 ? 'Lap to go' : 'Laps to go',
    };
  return { value: '—', label: 'Session active' };
}

export function flagElapsedSeconds(
  snapshot: TimingSnapshot,
  feedState: FeedState,
  secondsAgo: number,
) {
  const startedAt = new Date(
    snapshot.flagStartedAt || snapshot.initializedAt || snapshot.updatedAt,
  ).getTime();
  const updatedAt = new Date(snapshot.updatedAt).getTime();
  if (!Number.isFinite(startedAt) || !Number.isFinite(updatedAt)) return 0;
  const endAt =
    feedState === 'history' ? updatedAt : updatedAt + secondsAgo * 1_000;
  return Math.max(0, Math.floor((endAt - startedAt) / 1_000));
}

export function formatElapsed(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function countdownTime(value: string, secondsElapsed: number) {
  const match = value.match(/^(\d+):(\d{2}):(\d{2})(?:\.\d+)?$/);
  if (!match) return shortTime(value);
  const remaining = Math.max(
    0,
    Number(match[1]) * 3_600 +
      Number(match[2]) * 60 +
      Number(match[3]) -
      secondsElapsed,
  );
  const hours = Math.floor(remaining / 3_600);
  const minutes = Math.floor((remaining % 3_600) / 60);
  const seconds = remaining % 60;
  return `${hours ? `${hours}:` : ''}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function shortTime(value: string) {
  return value.replace(/^00:/, '');
}

export function updatedAgoText(secondsAgo: number) {
  if (secondsAgo < 2) return 'Updated just now';
  if (secondsAgo < 90) return `Updated ${secondsAgo}s ago`;
  return `Updated ${Math.round(secondsAgo / 60)} min ago`;
}

/** Session-best raw lap in milliseconds, or Infinity if nobody has a lap. */
export function sessionBestLap(cars: TimingCar[]) {
  return Math.min(...cars.map((car) => lapTimeToMilliseconds(car.bestLap)));
}

export function isSessionBest(car: TimingCar, bestMs: number) {
  return (
    Number.isFinite(bestMs) && lapTimeToMilliseconds(car.bestLap) === bestMs
  );
}

export function formatResultAdjustment(
  adjustment: NonNullable<TimingCar['resultAdjustment']>,
) {
  return [
    adjustment.status,
    adjustment.penaltySeconds > 0
      ? `+${adjustment.penaltySeconds.toFixed(3).replace(/\.0+$/, '')}s`
      : '',
    adjustment.positionOverride ? `placed P${adjustment.positionOverride}` : '',
    adjustment.note,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function resultSheetHref(eventId: string, sessionId: string) {
  const params = new URLSearchParams({ event: eventId });
  if (sessionId) params.set('session', sessionId);
  return `/api/result-sheet?${params.toString()}`;
}

const trackTimeFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TRACK_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
});
const trackDayFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TRACK_TIME_ZONE,
  weekday: 'long',
  month: 'short',
  day: 'numeric',
});
const trackDayKeyFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TRACK_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function validDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function formatTrackTime(value: string) {
  const date = validDate(value);
  return date ? trackTimeFormat.format(date) : '';
}

export function formatTrackDay(value: string) {
  const date = validDate(value);
  return date ? trackDayFormat.format(date) : 'Saved sessions';
}

/** Groups sessions by race day (track time), keeping the incoming order. */
export function groupSessionsByDay(sessions: TimingSessionSummary[]) {
  const days: Array<{
    key: string;
    label: string;
    sessions: TimingSessionSummary[];
  }> = [];
  for (const session of sessions) {
    const date = validDate(session.startedAt);
    const key = date ? trackDayKeyFormat.format(date) : 'unknown';
    let day = days.find((entry) => entry.key === key);
    if (!day) {
      day = { key, label: formatTrackDay(session.startedAt), sessions: [] };
      days.push(day);
    }
    day.sessions.push(session);
  }
  return days;
}

export function compareGroups(left: string, right: string) {
  const leftNumber = Number(left.match(/^Group\s+(\d+)$/i)?.[1]);
  const rightNumber = Number(right.match(/^Group\s+(\d+)$/i)?.[1]);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber))
    return leftNumber - rightNumber;
  if (Number.isFinite(leftNumber)) return -1;
  if (Number.isFinite(rightNumber)) return 1;
  return left.localeCompare(right);
}

export function formatGroupList(groups: string[]) {
  const sorted = [...new Set(groups.filter(Boolean))].sort(compareGroups);
  if (!sorted.length) return '';
  const numbered = sorted.every((group) => /^Group\s+\d+$/i.test(group));
  const names = numbered
    ? sorted.map((group) => group.replace(/^Group\s+/i, ''))
    : sorted;
  const joined =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} & ${names.at(-1)}`;
  if (!numbered) return joined;
  return `${names.length === 1 ? 'Group' : 'Groups'} ${joined}`;
}

/** Splits "Groups 2 & 7 · Race 4" into a session title and its run group. */
export function sessionTitleParts(runName: string, groups: string[] = []) {
  const formatted = formatSessionName(runName);
  const [first, ...rest] = formatted.split(' · ');
  if (rest.length) return { title: rest.join(' · '), group: first };
  return { title: formatted, group: formatGroupList(groups) };
}

export function eventPhase(now: number) {
  const start = new Date(currentEvent.startsAt).getTime();
  const end = new Date(currentEvent.endsAt).getTime();
  if (now < start) return 'before' as const;
  if (now <= end) return 'during' as const;
  return 'after' as const;
}

/** Whole calendar days (in track time) from `now` until the first race day. */
function calendarDaysFromStart(now: number) {
  const noon = (date: Date) =>
    Date.parse(`${trackDayKeyFormat.format(date)}T12:00:00Z`);
  return Math.round(
    (noon(new Date(now)) - noon(new Date(currentEvent.startsAt))) / 86_400_000,
  );
}

/** 0 on race day one, 1 the day before, and so on. */
export function daysUntilEvent(now: number) {
  return Math.max(0, -calendarDaysFromStart(now));
}

/** Index of today's schedule day (0 = Friday) while the event is running. */
export function eventDayIndex(now: number) {
  const offset = calendarDaysFromStart(now);
  return offset >= 0 && offset <= 2 ? offset : -1;
}
