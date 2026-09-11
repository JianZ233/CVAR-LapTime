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
import { demoSnapshot, isTimingSnapshot, rankSnapshotByBestLap, type TimingSnapshot } from '@/lib/timing';

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
      <header className="border-b border-white/10 bg-[#0b0e0f]/95">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center border border-[#d8ff3e]/35 bg-[#d8ff3e] font-mono text-sm font-black tracking-[-0.08em] text-[#0b0e0f] shadow-[4px_4px_0_#343a3d]">CVAR</div>
            <div>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-[#d8ff3e]">Canyon Classic</p>
              <h1 className="text-base font-semibold tracking-tight text-white sm:text-lg">{snapshot.trackName}</h1>
            </div>
          </div>
          <nav aria-label="Event views" className="order-3 flex h-9 w-full items-center gap-1 sm:order-none sm:w-auto">
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
    <button type="button" aria-pressed={active} onClick={onClick} className={`relative inline-flex h-9 items-center gap-1.5 px-3 text-sm font-medium transition-colors after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-[#d8ff3e] after:transition-opacity [&_svg]:size-4 ${active ? 'text-white after:opacity-100' : 'text-zinc-400 after:opacity-0 hover:text-white'}`}>
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
    <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
      {feedState === 'demo' && (
        <div className="mb-4 flex items-start gap-3 border border-amber-300/20 bg-amber-300/[0.07] px-4 py-3 text-sm text-amber-100">
          <Radio aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-300" />
          <p><strong>Demo feed.</strong> The board is ready for testing; live data appears automatically after the Orbits relay and Vercel Redis are connected.</p>
        </div>
      )}

      <section className="mb-4 flex flex-col gap-3 border border-white/10 bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">Timing session</p>
          <p className="mt-1 text-sm text-zinc-300">Choose Live or review a completed group session.</p>
        </div>
        <Select value={selectedSessionId} onValueChange={(value) => onSessionChange(value || 'live')}>
          <SelectTrigger aria-label="Choose timing session" className="h-10 w-full min-w-64 rounded-none border-white/15 bg-black/20 text-white sm:w-auto">
            <SelectValue>{selectedSessionId === 'live' ? `Live · ${friendlySessionName(liveSession?.runName || 'Current session')}` : friendlySessionName(selectedSession?.runName || snapshot.runName)}</SelectValue>
          </SelectTrigger>
          <SelectContent align="end" className="min-w-72 rounded-none border-white/10 bg-[#15191b] text-white">
            <SelectItem value="live">Live · {friendlySessionName(liveSession?.runName || 'Current session')}</SelectItem>
            {sessions.filter((session) => session.id !== liveSessionId).map((session) => (
              <SelectItem key={session.id} value={session.id}>{friendlySessionName(session.runName)} · {sessionClockTime(session.startedAt)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(150px,0.6fr))]">
        <div className="relative overflow-hidden border border-white/10 bg-card p-5 sm:col-span-2 lg:col-span-1">
          <div className="absolute inset-y-0 left-0 w-1 bg-[#d8ff3e]" />
          <p className="mb-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">{snapshot.eventName} · September 11-13</p>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-2xl font-bold tracking-[-0.03em] sm:text-3xl">{friendlySessionName(snapshot.runName)}</h2>
            <span className="font-mono text-sm text-muted-foreground">{sessionClockText(snapshot, feedState, secondsAgo)}</span>
          </div>
        </div>
        <Stat label="Track" value={trackPrimary(snapshot.trackLength)} detail={trackDetail(snapshot.trackLength)} />
        <Stat label="Leader" value={leader ? `#${leader.number}` : '—'} detail={leader?.bestLap || 'No timed laps'} accent />
        <Stat label="Cars timed" value={String(snapshot.cars.length)} detail="Best-lap order" />
      </section>

      <section className="overflow-hidden border border-white/10 bg-card shadow-[0_18px_70px_rgba(0,0,0,0.25)]">
        <div className="flex flex-col gap-4 border-b border-white/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div><p className="text-lg font-bold tracking-tight">Best-lap classification</p><p className="mt-0.5 text-sm text-muted-foreground">Updates when each car crosses start / finish</p></div>
          <div className="flex flex-wrap gap-2" aria-label="Filter timing by class">
            {classes.map((className) => (
              <Button key={className} type="button" size="sm" variant={selectedClass === className ? 'default' : 'outline'} onClick={() => setActiveClass(className)} className={selectedClass === className ? 'bg-[#d8ff3e] text-[#0b0e0f] hover:bg-[#c8ef35]' : 'border-white/15 bg-transparent text-zinc-300 hover:bg-white/5'}>{className}</Button>
            ))}
          </div>
        </div>

        {cars.length > 0 ? (
          <Table>
            <TableHeader className="bg-black/20">
              <TableRow className="border-white/10 hover:bg-transparent">
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
                <TableRow key={car.registrationKey || car.registrationNumber} className="border-white/10 hover:bg-white/[0.035]">
                  <TableCell className="px-4 py-4 sm:px-5"><div className="flex items-center gap-2"><span className="font-mono text-lg font-bold tabular-nums">{car.position || '—'}</span>{car.position === 1 && <Flag aria-label="Session leader" className="size-3.5 fill-[#d8ff3e] text-[#d8ff3e]" />}</div></TableCell>
                  <TableCell><span className="inline-grid min-w-11 place-items-center bg-white px-2 py-1 font-mono text-base font-black text-black">{car.number}</span></TableCell>
                  <TableCell className="py-4"><p className="font-semibold text-white">{car.driver || `Car ${car.number}`}</p><p className="mt-0.5 text-xs text-muted-foreground md:hidden">{[car.groupName, car.className].filter(Boolean).join(' · ') || car.car}</p>{car.car && <p className="mt-0.5 hidden text-xs text-muted-foreground md:block">{car.car}</p>}</TableCell>
                  <TableCell className="hidden text-zinc-300 md:table-cell">{car.groupName || '—'}</TableCell>
                  <TableCell className="hidden text-zinc-300 lg:table-cell">{car.className || '—'}</TableCell>
                  <TableCell className="text-right font-mono text-base tabular-nums">{car.laps}</TableCell>
                  <TableCell className="hidden text-right font-mono text-base tabular-nums text-zinc-300 lg:table-cell">{car.totalTime || '—'}</TableCell>
                  <TableCell className="hidden text-right font-mono text-base tabular-nums text-zinc-300 sm:table-cell">{car.lastLap || '—'}</TableCell>
                  <TableCell className="pr-4 text-right font-mono text-base font-bold tabular-nums text-[#d8ff3e] sm:pr-5">{car.bestLap || '—'}</TableCell>
                  <TableCell className="hidden pr-5 text-right font-mono text-sm tabular-nums text-muted-foreground xl:table-cell">{car.gap || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="grid min-h-64 place-items-center p-8 text-center"><div><Flag className="mx-auto mb-3 size-7 text-muted-foreground" /><p className="font-semibold">Waiting for the first timed car</p><p className="mt-1 text-sm text-muted-foreground">Cars appear here after crossing start / finish.</p></div></div>
        )}
      </section>

      <footer className="mt-4 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-center gap-2"><RotateCcw aria-hidden="true" className="size-3.5" /> {feedState === 'demo' ? 'Showing rehearsal data' : feedState === 'history' ? 'Viewing saved session results' : `Updated ${secondsAgo < 2 ? 'just now' : `${secondsAgo} seconds ago`}`}</span>
        <span>Unofficial timing · Results are final only after steward review</span>
      </footer>
    </div>
  );
}

function ScheduleView() {
  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div><p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#d8ff3e]">September 11-13, 2026</p><h2 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-white">Canyon Classic at ECR</h2></div>
        <p className="max-w-md text-sm text-muted-foreground">Times and run order are from the organizer schedule and may change at the track. Listen for grid calls by text, PA, and 464.5000.</p>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        {eventSchedule.map((day) => (
          <section key={day.day} className="overflow-hidden border border-white/10 bg-card">
            <header className="flex items-baseline justify-between border-b border-white/10 bg-black/20 px-5 py-4"><h3 className="text-xl font-bold text-white">{day.day}</h3><span className="font-mono text-sm text-[#d8ff3e]">{day.date}</span></header>
            <div className="divide-y divide-white/10">
              {day.items.map((item, index) => <ScheduleRow key={`${day.day}-${item.title}-${index}`} item={item} />)}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-4 border border-white/10 bg-card px-5 py-4 text-sm text-muted-foreground"><strong className="text-zinc-200">Screaming Eagles:</strong> Spec Boxster, Spec Miata, and Toyota GR86.</div>
    </div>
  );
}

function ScheduleRow({ item }: { item: ScheduleItem }) {
  const Icon = item.kind === 'meeting' ? Users : item.kind === 'break' ? Clock3 : TimerReset;
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 px-5 py-4">
      <Icon aria-hidden="true" className={`mt-0.5 size-4 ${item.kind === 'track' ? 'text-[#d8ff3e]' : 'text-muted-foreground'}`} />
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><p className="font-semibold text-white">{item.title}</p>{item.time && <time className="font-mono text-sm text-zinc-300">{item.time}</time>}</div>
        {item.duration && <p className="mt-1 font-mono text-xs uppercase tracking-wider text-[#d8ff3e]">{item.duration}</p>}
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
  if (state === 'live') return <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm font-semibold text-emerald-300"><Radio aria-hidden="true" className="size-4" /><span className="hidden sm:inline">Timing feed live</span><span className="sm:hidden">Live</span></div>;
  if (state === 'history') return <div className="flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-2 text-sm font-semibold text-sky-300"><Clock3 aria-hidden="true" className="size-4" /><span className="hidden sm:inline">Past session</span><span className="sm:hidden">Past</span></div>;
  if (state === 'stale') return <div className="flex items-center gap-2 rounded-full border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm font-semibold text-red-300"><WifiOff aria-hidden="true" className="size-4" /><span className="hidden sm:inline">Feed delayed</span><span className="sm:hidden">Delayed</span></div>;
  return <div className="flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-sm font-semibold text-amber-200"><Radio aria-hidden="true" className="size-4" /><span className="hidden sm:inline">Demo mode</span><span className="sm:hidden">Demo</span></div>;
}

function Stat({ label, value, detail, accent = false }: { label: string; value: string; detail: string; accent?: boolean }) {
  return <div className="border border-white/10 bg-card p-4"><p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p><p className={`mt-2 font-mono text-2xl font-bold tracking-tight ${accent ? 'text-[#d8ff3e]' : 'text-white'}`}>{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;
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

function friendlySessionName(value: string) {
  const match = value.match(/^Gp([0-9,]+)-([^=]+)(?:=(.+))?$/i);
  if (!match) return value;
  const groups = match[1].split(',');
  const groupLabel = groups.length === 1 ? `Group ${groups[0]}` : `Groups ${groups.slice(0, -1).join(', ')} & ${groups.at(-1)}`;
  const sessionLabel = (match[3] || match[2]).replace(/^TT(\d+)$/i, 'Test & Tune $1').replace(/^R(\d+)$/i, 'Race $1').replace(/^PQ$/i, 'Practice / Qualifying');
  return `${groupLabel} · ${sessionLabel}`;
}

function sessionClockTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
}

function shortTime(value: string) { return value.replace(/^00:/, ''); }
function trackPrimary(value: string) { return value.split('·')[0]?.trim() || '2.7 mi'; }
function trackDetail(value: string) { return value.split('·')[1]?.trim() || 'Start / finish loop'; }
