'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Flag, Radio, RotateCcw, WifiOff } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { demoSnapshot, isTimingSnapshot, type TimingSnapshot } from '@/lib/timing';

type FeedState = 'demo' | 'live' | 'stale';

export default function Home() {
  const { snapshot, feedState, secondsAgo } = useLiveTiming();
  const [activeClass, setActiveClass] = useState('All cars');
  const classes = useMemo(
    () => ['All cars', ...new Set(snapshot.cars.map((car) => car.className).filter(Boolean))],
    [snapshot.cars],
  );
  const selectedClass = classes.includes(activeClass) ? activeClass : 'All cars';
  const cars = useMemo(
    () => selectedClass === 'All cars' ? snapshot.cars : snapshot.cars.filter((car) => car.className === selectedClass),
    [selectedClass, snapshot.cars],
  );
  const leader = snapshot.cars[0];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-white/10 bg-[#0b0e0f]/95">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center border border-[#d8ff3e]/35 bg-[#d8ff3e] font-mono text-sm font-black tracking-[-0.08em] text-[#0b0e0f] shadow-[4px_4px_0_#343a3d]">
              CVAR
            </div>
            <div>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-[#d8ff3e]">Live timing</p>
              <h1 className="text-base font-semibold tracking-tight text-white sm:text-lg">{snapshot.trackName}</h1>
            </div>
          </div>
          <FeedBadge state={feedState} />
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        {feedState === 'demo' && (
          <div className="mb-4 flex items-start gap-3 border border-amber-300/20 bg-amber-300/[0.07] px-4 py-3 text-sm text-amber-100">
            <Radio aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-300" />
            <p><strong>Demo feed.</strong> The board is ready for testing; live data appears automatically after the Orbits relay and Vercel Redis are connected.</p>
          </div>
        )}

        <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(150px,0.6fr))]">
          <div className="relative overflow-hidden border border-white/10 bg-card p-5 sm:col-span-2 lg:col-span-1">
            <div className="absolute inset-y-0 left-0 w-1 bg-[#d8ff3e]" />
            <p className="mb-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">{snapshot.eventName}</p>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-2xl font-bold tracking-[-0.03em] sm:text-3xl">{snapshot.runName}</h2>
              <span className="font-mono text-sm text-muted-foreground">
                {snapshot.timeToGo ? `${shortTime(snapshot.timeToGo)} remaining` : snapshot.lapsToGo !== null ? `${snapshot.lapsToGo} laps to go` : 'Session active'}
              </span>
            </div>
          </div>
          <Stat label="Track" value={trackPrimary(snapshot.trackLength)} detail={trackDetail(snapshot.trackLength)} />
          <Stat label="Leader" value={leader ? `#${leader.number}` : '—'} detail={leader?.bestLap || 'No timed laps'} accent />
          <Stat label="Cars timed" value={String(snapshot.cars.length)} detail={snapshot.sessionMode === 'race' ? 'Race order' : 'Best-lap order'} />
        </section>

        <section className="overflow-hidden border border-white/10 bg-card shadow-[0_18px_70px_rgba(0,0,0,0.25)]">
          <div className="flex flex-col gap-4 border-b border-white/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <p className="text-lg font-bold tracking-tight">{snapshot.sessionMode === 'race' ? 'Race classification' : 'Overall classification'}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">Updates when each car crosses start / finish</p>
            </div>
            <div className="flex flex-wrap gap-2" aria-label="Filter timing by class">
              {classes.map((className) => (
                <Button
                  key={className}
                  type="button"
                  size="sm"
                  variant={selectedClass === className ? 'default' : 'outline'}
                  onClick={() => setActiveClass(className)}
                  className={selectedClass === className ? 'bg-[#d8ff3e] text-[#0b0e0f] hover:bg-[#c8ef35]' : 'border-white/15 bg-transparent text-zinc-300 hover:bg-white/5'}
                >
                  {className}
                </Button>
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
                  <TableHead className="hidden font-mono text-xs uppercase tracking-wider text-muted-foreground md:table-cell">Class</TableHead>
                  <TableHead className="text-right font-mono text-xs uppercase tracking-wider text-muted-foreground">Laps</TableHead>
                  <TableHead className="hidden text-right font-mono text-xs uppercase tracking-wider text-muted-foreground sm:table-cell">Last lap</TableHead>
                  <TableHead className="pr-4 text-right font-mono text-xs uppercase tracking-wider text-muted-foreground sm:pr-5">Best lap</TableHead>
                  <TableHead className="hidden pr-5 text-right font-mono text-xs uppercase tracking-wider text-muted-foreground lg:table-cell">Gap</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cars.map((car) => (
                  <TableRow key={car.registrationNumber} className="border-white/10 hover:bg-white/[0.035]">
                    <TableCell className="px-4 py-4 sm:px-5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-lg font-bold tabular-nums">{car.position || '—'}</span>
                        {car.position === 1 && <Flag aria-label="Session leader" className="size-3.5 fill-[#d8ff3e] text-[#d8ff3e]" />}
                      </div>
                    </TableCell>
                    <TableCell><span className="inline-grid min-w-11 place-items-center bg-white px-2 py-1 font-mono text-base font-black text-black">{car.number}</span></TableCell>
                    <TableCell className="py-4">
                      <p className="font-semibold text-white">{car.driver || `Car ${car.number}`}</p>
                      {car.car && <p className="mt-0.5 text-xs text-muted-foreground">{car.car}</p>}
                    </TableCell>
                    <TableCell className="hidden text-zinc-300 md:table-cell">{car.className || '—'}</TableCell>
                    <TableCell className="text-right font-mono text-base tabular-nums">{car.laps}</TableCell>
                    <TableCell className="hidden text-right font-mono text-base tabular-nums text-zinc-300 sm:table-cell">{car.lastLap || '—'}</TableCell>
                    <TableCell className="pr-4 text-right font-mono text-base font-bold tabular-nums text-[#d8ff3e] sm:pr-5">{car.bestLap || '—'}</TableCell>
                    <TableCell className="hidden pr-5 text-right font-mono text-sm tabular-nums text-muted-foreground lg:table-cell">{car.gap || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="grid min-h-64 place-items-center p-8 text-center">
              <div><Flag className="mx-auto mb-3 size-7 text-muted-foreground" /><p className="font-semibold">Waiting for the first timed car</p><p className="mt-1 text-sm text-muted-foreground">Cars appear here after crossing start / finish.</p></div>
            </div>
          )}
        </section>

        <footer className="mt-4 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2"><RotateCcw aria-hidden="true" className="size-3.5" /> {feedState === 'demo' ? 'Showing rehearsal data' : `Updated ${secondsAgo < 2 ? 'just now' : `${secondsAgo} seconds ago`}`}</span>
          <span>Unofficial timing · Results are final only after steward review</span>
        </footer>
      </div>
    </main>
  );
}

function useLiveTiming() {
  const [snapshot, setSnapshot] = useState<TimingSnapshot>(demoSnapshot);
  const [feedState, setFeedState] = useState<FeedState>('demo');
  const [clock, setClock] = useState(0);
  const hasReceivedLive = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const response = await fetch('/api/live', { cache: 'no-store' });
        if (!response.ok) throw new Error(`Live endpoint returned ${response.status}`);
        const body = await response.json() as { snapshot?: unknown };
        if (!isTimingSnapshot(body.snapshot)) throw new Error('Invalid timing snapshot');
        if (cancelled) return;
        hasReceivedLive.current = true;
        setSnapshot(body.snapshot);
        const age = Date.now() - new Date(body.snapshot.updatedAt).getTime();
        setFeedState(age > 15_000 ? 'stale' : 'live');
      } catch {
        if (!cancelled && hasReceivedLive.current) setFeedState('stale');
      }
    }

    void refresh();
    const poller = window.setInterval(refresh, 2_000);
    const ticker = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => { cancelled = true; window.clearInterval(poller); window.clearInterval(ticker); };
  }, []);

  const timestamp = new Date(snapshot.updatedAt).getTime();
  const secondsAgo = Number.isFinite(timestamp) ? Math.max(0, Math.floor((clock - timestamp) / 1_000)) : 0;
  return { snapshot, feedState: feedState === 'live' && secondsAgo > 15 ? 'stale' as const : feedState, secondsAgo };
}

function FeedBadge({ state }: { state: FeedState }) {
  if (state === 'live') return <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm font-semibold text-emerald-300"><Radio aria-hidden="true" className="size-4" /><span className="hidden sm:inline">Timing feed live</span><span className="sm:hidden">Live</span></div>;
  if (state === 'stale') return <div className="flex items-center gap-2 rounded-full border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm font-semibold text-red-300"><WifiOff aria-hidden="true" className="size-4" /><span className="hidden sm:inline">Feed delayed</span><span className="sm:hidden">Delayed</span></div>;
  return <div className="flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-sm font-semibold text-amber-200"><Radio aria-hidden="true" className="size-4" /><span className="hidden sm:inline">Demo mode</span><span className="sm:hidden">Demo</span></div>;
}

function Stat({ label, value, detail, accent = false }: { label: string; value: string; detail: string; accent?: boolean }) {
  return <div className="border border-white/10 bg-card p-4"><p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p><p className={`mt-2 font-mono text-2xl font-bold tracking-tight ${accent ? 'text-[#d8ff3e]' : 'text-white'}`}>{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;
}

function shortTime(value: string) {
  return value.replace(/^00:/, '');
}

function trackPrimary(value: string) {
  return value.split('·')[0]?.trim() || '2.7 mi';
}

function trackDetail(value: string) {
  return value.split('·')[1]?.trim() || 'Start / finish loop';
}
