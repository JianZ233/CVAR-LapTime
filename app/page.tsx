'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Clock3, Flag, Radio, RotateCcw, TimerReset, Users, WifiOff } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { eventSchedule, type ScheduleItem } from '@/lib/schedule';
import {
  demoSnapshot,
  formatSessionName,
  formatTrackDetail,
  formatTrackPrimary,
  formatTrackSummary,
  isTimingSnapshot,
  rankSnapshotByBestLap,
  type TimingSnapshot,
} from '@/lib/timing';

type FeedState = 'demo' | 'live' | 'stale' | 'history';

type TimingSessionSummary = {
  id: string;
  startedAt: string;
  runId: string;
  runName: string;
  flag: string;
  groups: string[];
  carCount: number;
  updatedAt: string;
};

export default function Home() {
  const { snapshot, feedState, secondsAgo, sessions, liveSessionId, selectedSessionId, selectSession } = useLiveTiming();
  const [activeView, setActiveView] = useState<'timing' | 'schedule'>('timing');

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="site-header">
        <div className="race-ribbon">
          <span>Official event timing</span>
          <span className="hidden sm:inline">Canyon Classic · September 11–13, 2026</span>
        </div>
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="brand-lockup">
            <img src="/cvar-logo.png" alt="Corinthian Vintage Auto Racing" className="brand-mark" />
            <div className="brand-copy">
              <p>CVAR live timing</p>
              <h1>{snapshot.trackName}</h1>
            </div>
          </div>
          <nav aria-label="Event views" className="view-switcher order-3 flex w-full items-center sm:order-none sm:w-auto">
            <ViewTab active={activeView === 'timing'} onClick={() => setActiveView('timing')}><Radio />Live timing</ViewTab>
            <ViewTab active={activeView === 'schedule'} onClick={() => setActiveView('schedule')}><CalendarDays />Schedule</ViewTab>
          </nav>
          <FeedBadge state={feedState} />
        </div>
      </header>

      <main>
        {activeView === 'timing' ? <TimingBoard snapshot={snapshot} feedState={feedState} secondsAgo={secondsAgo} sessions={sessions} liveSessionId={liveSessionId} selectedSessionId={selectedSessionId} onSessionChange={selectSession} /> : <ScheduleView />}
      </main>
    </div>
  );
}

function ViewTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={`view-tab ${active ? 'view-tab-active' : ''}`}>
      {children}
    </button>
  );
}

function TimingBoard({ snapshot, feedState, secondsAgo, sessions, liveSessionId, selectedSessionId, onSessionChange }: { snapshot: TimingSnapshot; feedState: FeedState; secondsAgo: number; sessions: TimingSessionSummary[]; liveSessionId: string; selectedSessionId: string; onSessionChange: (sessionId: string) => void }) {
  const [activeClass, setActiveClass] = useState('All cars');
  const classes = useMemo(() => ['All cars', ...new Set(snapshot.cars.map((car) => car.className).filter(Boolean))], [snapshot.cars]);
  const selectedClass = classes.includes(activeClass) ? activeClass : 'All cars';
  const cars = useMemo(() => selectedClass === 'All cars' ? snapshot.cars : snapshot.cars.filter((car) => car.className === selectedClass), [selectedClass, snapshot.cars]);
  const leader = snapshot.cars[0];
  const liveSession = sessions.find((session) => session.id === liveSessionId);
  const selectedSession = sessions.find((session) => session.id === selectedSessionId);

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
      {feedState === 'demo' && (
        <div className="demo-notice">
          <Radio aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p><strong>Demo feed.</strong> The board is ready for testing; live data appears automatically after the Orbits relay and Vercel Redis are connected.</p>
        </div>
      )}

      <section className="timing-hero">
        <div className="timing-hero-content">
          <div className="hero-kicker">
            <span>{snapshot.eventName}</span>
            <span className="hero-kicker-rule" />
            <span>Sept 11–13</span>
          </div>
          <div className="hero-title-row">
            <div>
              <span className="flag-chip"><span className="flag-dot" />{snapshot.flag === 'NOT ACTIVE' ? 'Timing' : snapshot.flag}</span>
              <h2>{formatSessionName(snapshot.runName)}</h2>
              <p>{snapshot.trackName} · {formatTrackSummary(snapshot.trackLength, snapshot.trackName)}</p>
            </div>
            <div className="session-clock">
              <span>Session clock</span>
              <strong>{sessionClockText(snapshot, feedState, secondsAgo)}</strong>
            </div>
          </div>
        </div>
        <div className="session-picker">
          <div>
            <p>Timing session</p>
            <span>Live feed or saved results</span>
          </div>
          <Select value={selectedSessionId} onValueChange={(value) => onSessionChange(value || 'live')}>
            <SelectTrigger aria-label="Choose timing session" className="session-select">
              <SelectValue>{selectedSessionId === 'live' ? `Live · ${formatSessionName(liveSession?.runName || 'Current session')}` : formatSessionName(selectedSession?.runName || snapshot.runName)}</SelectValue>
            </SelectTrigger>
            <SelectContent align="end" className="min-w-72 border-white/10 bg-[#102838] text-white">
              <SelectItem value="live">Live · {formatSessionName(liveSession?.runName || 'Current session')}</SelectItem>
              {sessions.filter((session) => session.id !== liveSessionId).map((session) => (
                <SelectItem key={session.id} value={session.id}>{formatSessionName(session.runName)} · {sessionClockTime(session.startedAt)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="stats-grid">
        <Stat label="Track" value={formatTrackPrimary(snapshot.trackLength)} detail={formatTrackDetail(snapshot.trackLength, snapshot.trackName)} />
        <Stat label="Leader" value={leader ? `#${leader.number}` : '—'} detail={leader?.bestLap || 'No timed laps'} accent />
        <Stat label="Cars timed" value={String(snapshot.cars.length)} detail="Best-lap order" />
      </section>

      <section className="timing-card">
        <div className="timing-card-header">
          <div><p className="classification-title">Best-lap classification</p><p className="mt-1 text-sm text-muted-foreground">Updates at every start / finish crossing</p></div>
          <div className="class-filter" aria-label="Filter timing by class">
            {classes.map((className) => (
              <Button key={className} type="button" size="sm" variant={selectedClass === className ? 'default' : 'outline'} onClick={() => setActiveClass(className)} className={selectedClass === className ? 'class-filter-active' : 'class-filter-button'}>{className}</Button>
            ))}
          </div>
        </div>

        {cars.length > 0 ? (
          <div className="overflow-x-auto">
          <Table className="timing-table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-16 px-4 font-mono text-xs uppercase tracking-wider text-muted-foreground sm:px-5">Pos</TableHead>
                <TableHead className="w-20 font-mono text-xs uppercase tracking-wider text-muted-foreground">Car</TableHead>
                <TableHead className="min-w-[210px] font-mono text-xs uppercase tracking-wider text-muted-foreground">Driver</TableHead>
                <TableHead className="hidden font-mono text-xs uppercase tracking-wider text-muted-foreground md:table-cell">Group</TableHead>
                <TableHead className="hidden font-mono text-xs uppercase tracking-wider text-muted-foreground lg:table-cell">Class</TableHead>
                <TableHead className="text-right font-mono text-xs uppercase tracking-wider text-muted-foreground">Laps</TableHead>
                <TableHead className="hidden text-right font-mono text-xs uppercase tracking-wider text-muted-foreground lg:table-cell">Total time</TableHead>
                <TableHead className="hidden text-right font-mono text-xs uppercase tracking-wider text-muted-foreground sm:table-cell">Last lap</TableHead>
                <TableHead className="pr-4 text-right font-mono text-xs uppercase tracking-wider text-muted-foreground sm:pr-5">Best lap</TableHead>
                <TableHead className="hidden pr-5 text-right font-mono text-xs uppercase tracking-wider text-muted-foreground xl:table-cell">Gap</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cars.map((car) => (
                <TableRow key={car.registrationKey || car.registrationNumber}>
                  <TableCell className="px-4 py-4 sm:px-5"><div className="flex items-center gap-2"><span className="position-number">{car.position || '—'}</span>{car.position === 1 && <Flag aria-label="Session leader" className="leader-flag" />}</div></TableCell>
                  <TableCell><span className="car-number">{car.number}</span></TableCell>
                  <TableCell className="py-4"><p className="font-semibold text-white">{car.driver || `Car ${car.number}`}</p><p className="mt-0.5 text-xs text-muted-foreground md:hidden">{[car.groupName, car.className].filter(Boolean).join(' · ') || car.car}</p>{car.car && <p className="mt-0.5 hidden text-xs text-muted-foreground md:block">{car.car}</p>}</TableCell>
                  <TableCell className="hidden text-slate-300 md:table-cell">{car.groupName || '—'}</TableCell>
                  <TableCell className="hidden text-slate-300 lg:table-cell">{car.className || '—'}</TableCell>
                  <TableCell className="text-right font-mono text-base tabular-nums">{car.laps}</TableCell>
                  <TableCell className="hidden text-right font-mono text-base tabular-nums text-slate-300 lg:table-cell">{car.totalTime || '—'}</TableCell>
                  <TableCell className="hidden text-right font-mono text-base tabular-nums text-slate-300 sm:table-cell">{car.lastLap || '—'}</TableCell>
                  <TableCell className="best-lap pr-4 text-right sm:pr-5">{car.bestLap || '—'}</TableCell>
                  <TableCell className="hidden pr-5 text-right font-mono text-sm tabular-nums text-muted-foreground xl:table-cell">{car.gap || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        ) : (
          <div className="grid min-h-64 place-items-center p-8 text-center"><div><Flag className="mx-auto mb-3 size-7 text-muted-foreground" /><p className="font-semibold">Waiting for the first timed car</p><p className="mt-1 text-sm text-muted-foreground">Cars appear here after crossing start / finish.</p></div></div>
        )}
      </section>

      <footer className="timing-footer">
        <span className="flex items-center gap-2"><RotateCcw aria-hidden="true" className="size-3.5" /> {feedState === 'demo' ? 'Showing rehearsal data' : feedState === 'history' ? 'Viewing saved session results' : `Updated ${secondsAgo < 2 ? 'just now' : `${secondsAgo} seconds ago`}`}</span>
        <span>Unofficial timing · Results are final only after steward review</span>
      </footer>
    </div>
  );
}

function ScheduleView() {
  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="schedule-intro">
        <div><p className="eyebrow">September 11–13, 2026</p><h2>Canyon Classic at ECR</h2></div>
        <p className="max-w-md text-sm text-muted-foreground">Times and run order are from the organizer schedule and may change at the track. Listen for grid calls by text, PA, and 464.5000.</p>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        {eventSchedule.map((day) => (
          <section key={day.day} className="schedule-day">
            <header><div><span>Race day</span><h3>{day.day}</h3></div><time>{day.date}</time></header>
            <div className="schedule-list">
              {day.items.map((item, index) => <ScheduleRow key={`${day.day}-${item.title}-${index}`} item={item} />)}
            </div>
          </section>
        ))}
      </div>

      <div className="schedule-note"><strong>Screaming Eagles:</strong> Spec Boxster, Spec Miata, and Toyota GR86.</div>
    </div>
  );
}

function ScheduleRow({ item }: { item: ScheduleItem }) {
  const Icon = item.kind === 'meeting' ? Users : item.kind === 'break' ? Clock3 : TimerReset;
  return (
    <div className={`schedule-row schedule-row-${item.kind || 'track'}`}>
      <Icon aria-hidden="true" className="mt-0.5 size-4" />
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><p className="font-semibold text-white">{item.title}</p>{item.time && <time className="font-mono text-sm text-slate-300">{item.time}</time>}</div>
        {item.duration && <p className="schedule-duration">{item.duration}</p>}
        {item.groups && <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.groups.join(' · ')}</p>}
        {item.note && <p className="mt-2 text-sm leading-5 text-muted-foreground">{item.note}</p>}
      </div>
    </div>
  );
}

function useLiveTiming() {
  const [snapshot, setSnapshot] = useState<TimingSnapshot>(demoSnapshot);
  const [feedState, setFeedState] = useState<FeedState>('demo');
  const [clock, setClock] = useState(0);
  const [sessions, setSessions] = useState<TimingSessionSummary[]>([]);
  const [liveSessionId, setLiveSessionId] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState('live');
  const hasReceivedData = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function refreshSessions() {
      try {
        const response = await fetch('/api/sessions');
        if (!response.ok) return;
        const body = await response.json() as { liveSessionId?: unknown; sessions?: unknown };
        if (cancelled || !Array.isArray(body.sessions)) return;
        setSessions(body.sessions as TimingSessionSummary[]);
        if (typeof body.liveSessionId === 'string') setLiveSessionId(body.liveSessionId);
      } catch {
        // Live timing can continue even if the session menu refresh is delayed.
      }
    }
    void refreshSessions();
    const timer = window.setInterval(refreshSessions, 10_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const endpoint = selectedSessionId === 'live' ? '/api/live' : `/api/sessions?session=${encodeURIComponent(selectedSessionId)}`;
        const response = await fetch(endpoint);
        if (!response.ok) throw new Error(`Timing endpoint returned ${response.status}`);
        const body = await response.json() as { snapshot?: unknown };
        if (!isTimingSnapshot(body.snapshot)) throw new Error('Invalid timing snapshot');
        if (cancelled) return;
        hasReceivedData.current = true;
        setSnapshot(rankSnapshotByBestLap(body.snapshot));
        setFeedState(selectedSessionId === 'live' ? (Date.now() - new Date(body.snapshot.updatedAt).getTime() > 15_000 ? 'stale' : 'live') : 'history');
      } catch {
        if (!cancelled && hasReceivedData.current) setFeedState('stale');
      }
    }
    void refresh();
    const poller = selectedSessionId === 'live' ? window.setInterval(refresh, 2_000) : undefined;
    const ticker = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => { cancelled = true; if (poller) window.clearInterval(poller); window.clearInterval(ticker); };
  }, [selectedSessionId]);

  const timestamp = new Date(snapshot.updatedAt).getTime();
  const secondsAgo = Number.isFinite(timestamp) ? Math.max(0, Math.floor((clock - timestamp) / 1_000)) : 0;
  return { snapshot, feedState: feedState === 'live' && secondsAgo > 15 ? 'stale' as const : feedState, secondsAgo, sessions, liveSessionId, selectedSessionId, selectSession: setSelectedSessionId };
}

function FeedBadge({ state }: { state: FeedState }) {
  if (state === 'live') return <div className="feed-badge feed-live"><Radio aria-hidden="true" /><span className="hidden sm:inline">Timing feed live</span><span className="sm:hidden">Live</span></div>;
  if (state === 'history') return <div className="feed-badge feed-history"><Clock3 aria-hidden="true" /><span className="hidden sm:inline">Past session</span><span className="sm:hidden">Past</span></div>;
  if (state === 'stale') return <div className="feed-badge feed-stale"><WifiOff aria-hidden="true" /><span className="hidden sm:inline">Feed delayed</span><span className="sm:hidden">Delayed</span></div>;
  return <div className="feed-badge feed-demo"><Radio aria-hidden="true" /><span className="hidden sm:inline">Demo mode</span><span className="sm:hidden">Demo</span></div>;
}

function Stat({ label, value, detail, accent = false }: { label: string; value: string; detail: string; accent?: boolean }) {
  return <div className={`stat-card ${accent ? 'stat-card-accent' : ''}`}><p>{label}</p><strong>{value}</strong><span>{detail}</span></div>;
}

function sessionClockText(snapshot: TimingSnapshot, feedState: FeedState, secondsAgo: number) {
  if (feedState === 'history') return snapshot.raceTime ? `${shortTime(snapshot.raceTime)} elapsed` : 'Completed session';
  if (['FINISH', 'FINISHED', 'CHECKERED', 'CHEQUERED'].includes(snapshot.flag)) return snapshot.raceTime ? `Finished · ${shortTime(snapshot.raceTime)} elapsed` : 'Session finished';
  if (snapshot.flag === 'NOT ACTIVE') return 'Session not active';
  if (snapshot.timeToGo) {
    const shouldTick = feedState === 'live' && ['GREEN', 'YELLOW'].includes(snapshot.flag);
    return `${shouldTick ? countdownTime(snapshot.timeToGo, secondsAgo) : shortTime(snapshot.timeToGo)} remaining`;
  }
  if (snapshot.lapsToGo !== null && snapshot.lapsToGo < 9_999) return `${snapshot.lapsToGo} laps to go`;
  return 'Session active';
}

function countdownTime(value: string, secondsElapsed: number) {
  const match = value.match(/^(\d+):(\d{2}):(\d{2})(?:\.\d+)?$/);
  if (!match) return shortTime(value);
  const remaining = Math.max(0, Number(match[1]) * 3_600 + Number(match[2]) * 60 + Number(match[3]) - secondsElapsed);
  const hours = Math.floor(remaining / 3_600);
  const minutes = Math.floor((remaining % 3_600) / 60);
  const seconds = remaining % 60;
  return `${hours ? `${hours}:` : ''}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function sessionClockTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
}

function shortTime(value: string) { return value.replace(/^00:/, ''); }
