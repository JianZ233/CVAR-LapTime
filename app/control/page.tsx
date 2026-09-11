'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Clock3, Database, ExternalLink, LockKeyhole, LogOut, Radio, RefreshCw, Search, ShieldCheck, Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatSessionName } from '@/lib/timing';

type Registration = {
  registrationKey?: string;
  registrationNumber: string;
  sourceNumber?: string;
  number?: string;
  driver?: string;
  firstName?: string;
  lastName?: string;
  transponderId?: string;
  groupName?: string;
  className?: string;
  classNumber?: number | null;
  additionalInfo?: string;
  ambiguousRegistrationNumber?: boolean;
};

type LiveCar = Registration & {
  position?: number;
  laps?: number;
  totalTime?: string;
  lastLap?: string;
  bestLap?: string;
  bestLapNumber?: number;
};

type Snapshot = {
  eventName: string;
  trackName: string;
  runId?: string;
  runName: string;
  flag: string;
  updatedAt: string;
  timeOfDay?: string;
  raceTime?: string;
  cars: LiveCar[];
};

type Session = {
  id: string;
  startedAt: string;
  runId: string;
  runName: string;
  flag: string;
  passingCount: number;
  rawRecordCount: number;
};

type ControlData = {
  eventId: string;
  snapshot: Snapshot | null;
  registrations: Registration[];
  sessions: Session[];
};

type AccessState = 'checking' | 'signed-out' | 'ready' | 'error';

export default function ControlRoomPage() {
  const [accessState, setAccessState] = useState<AccessState>('checking');
  const [data, setData] = useState<ControlData | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const response = await fetch('/api/internal', { cache: 'no-store', credentials: 'same-origin' });
      if (response.status === 401) {
        setAccessState('signed-out');
        setData(null);
        return;
      }
      const body = await response.json() as ControlData & { error?: string };
      if (!response.ok) throw new Error(body.error || `Control room returned ${response.status}`);
      setData(body);
      setError('');
      setAccessState('ready');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load control room data');
      setAccessState('error');
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadData]);

  useEffect(() => {
    if (accessState !== 'ready') return;
    const timer = window.setInterval(() => void loadData(), 5_000);
    return () => window.clearInterval(timer);
  }, [accessState, loadData]);

  if (accessState === 'checking') return <ControlLoading />;
  if (accessState === 'signed-out') return <ControlLogin onSignedIn={() => void loadData()} />;
  if (accessState === 'error' || !data) return <ControlError message={error} onRetry={() => void loadData()} />;

  const rows = mergeRoster(data.registrations, data.snapshot?.cars || []);
  const normalizedSearch = search.trim().toLowerCase();
  const filteredRows = normalizedSearch ? rows.filter((row) => Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(normalizedSearch))) : rows;
  const rawRecordTotal = data.sessions.reduce((sum, session) => sum + session.rawRecordCount, 0);
  const passingTotal = data.sessions.reduce((sum, session) => sum + session.passingCount, 0);

  async function signOut() {
    await fetch('/api/internal-login', { method: 'DELETE', credentials: 'same-origin' });
    setAccessState('signed-out');
    setData(null);
  }

  async function refreshNow() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-white/10 bg-[#0b0e0f]/95">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center border border-[#d8ff3e]/35 bg-[#d8ff3e] text-[#0b0e0f]"><ShieldCheck className="size-5" /></div>
            <div><p className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-[#d8ff3e]">Internal access</p><h1 className="text-base font-semibold text-white sm:text-lg">CVAR Timing Control</h1></div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="border-white/15 bg-transparent text-zinc-200" onClick={() => void refreshNow()} disabled={refreshing}><RefreshCw className={refreshing ? 'animate-spin' : ''} />Refresh</Button>
            <Button variant="ghost" size="sm" className="text-zinc-300" onClick={() => void signOut()}><LogOut />Sign out</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1800px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">{data.snapshot?.trackName || 'Eagles Canyon Raceway'}</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-white">{data.snapshot ? formatSessionName(data.snapshot.runName) : 'Waiting for Orbits'}</h2></div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Radio className="size-4 text-[#d8ff3e]" />{data.snapshot ? `Updated ${formatTimestamp(data.snapshot.updatedAt)} · ${formatAge(data.snapshot.updatedAt)}` : 'No live snapshot yet'}</div>
        </div>

        <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <InternalStat icon={Radio} label="Live cars" value={String(data.snapshot?.cars.length || 0)} detail={`${data.snapshot?.flag || 'NOT ACTIVE'} · Run ${data.snapshot?.runId || '—'}`} />
          <InternalStat icon={Users} label="Registrations" value={String(data.registrations.length)} detail="Drivers and transponders" />
          <InternalStat icon={Clock3} label="Passings stored" value={passingTotal.toLocaleString()} detail={`${data.sessions.length} archived sessions`} />
          <InternalStat icon={Database} label="Raw records" value={rawRecordTotal.toLocaleString()} detail="Private RMonitor archive" />
        </section>

        <Tabs defaultValue="roster" className="gap-4">
          <TabsList variant="line" className="h-10 gap-4">
            <TabsTrigger value="roster" className="px-1">Roster & timing</TabsTrigger>
            <TabsTrigger value="sessions" className="px-1">Session archive</TabsTrigger>
          </TabsList>

          <TabsContent value="roster">
            <section className="overflow-hidden border border-white/10 bg-card">
              <div className="flex flex-col gap-3 border-b border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div><h3 className="font-semibold text-white">All competitor data</h3><p className="mt-0.5 text-sm text-muted-foreground">Private registration details merged with the current timing feed.</p></div>
                <div className="relative w-full sm:w-80"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search competitors" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Driver, car, transponder, group…" className="h-9 border-white/15 bg-black/20 pl-9" /></div>
              </div>
              <div className="overflow-x-auto">
                <Table className="min-w-[1320px]">
                  <TableHeader className="bg-black/20"><TableRow className="border-white/10 hover:bg-transparent">
                    {['Car', 'Driver', 'Transponder', 'Group', 'Class', 'Pos', 'Laps', 'Best lap', 'Best lap #', 'Last lap', 'Total time', 'Timing ID', 'Additional info'].map((heading) => <TableHead key={heading} className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{heading}</TableHead>)}
                  </TableRow></TableHeader>
                  <TableBody>
                    {filteredRows.map((row) => <RosterRow key={row.registrationKey || row.registrationNumber} row={row} live={Boolean(row.position)} />)}
                    {filteredRows.length === 0 && <TableRow><TableCell colSpan={13} className="h-40 text-center text-muted-foreground">No competitors match that search.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="sessions">
            <section className="overflow-hidden border border-white/10 bg-card">
              <div className="border-b border-white/10 p-4"><h3 className="font-semibold text-white">Stored sessions</h3><p className="mt-0.5 text-sm text-muted-foreground">Every passing and raw feed record is retained without automatic expiration.</p></div>
              <div className="overflow-x-auto"><Table className="min-w-[850px]">
                <TableHeader className="bg-black/20"><TableRow className="border-white/10 hover:bg-transparent"><TableHead>Started</TableHead><TableHead>Run</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Passings</TableHead><TableHead className="text-right">Raw records</TableHead><TableHead className="text-right">Private data</TableHead></TableRow></TableHeader>
                <TableBody>{data.sessions.map((session) => <TableRow key={session.id} className="border-white/10"><TableCell className="font-mono text-sm">{formatTimestamp(session.startedAt)}</TableCell><TableCell><p className="font-medium text-white">{formatSessionName(session.runName)}</p><p className="font-mono text-xs text-muted-foreground">Run {session.runId || '—'} · {session.id}</p></TableCell><TableCell><Badge variant="outline" className="border-white/15">{session.flag || '—'}</Badge></TableCell><TableCell className="text-right font-mono">{session.passingCount}</TableCell><TableCell className="text-right font-mono">{session.rawRecordCount}</TableCell><TableCell className="text-right"><a className="inline-flex items-center gap-1 text-sm font-medium text-[#d8ff3e] hover:underline" href={`/api/internal?event=${encodeURIComponent(data.eventId)}&session=${encodeURIComponent(session.id)}&raw=1&limit=500`} target="_blank" rel="noreferrer">Open JSON <ExternalLink className="size-3.5" /></a></TableCell></TableRow>)}</TableBody>
              </Table></div>
              {data.sessions.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">No sessions have been stored yet.</div>}
            </section>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function ControlLogin({ onSignedIn }: { onSignedIn: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: { preventDefault: () => void }) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/internal-login', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to sign in');
      setPassword('');
      onSignedIn();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to sign in');
    } finally {
      setSubmitting(false);
    }
  }

  return <div className="grid min-h-screen place-items-center px-4"><form onSubmit={submit} className="w-full max-w-md border border-white/10 bg-card p-6 shadow-[0_24px_90px_rgba(0,0,0,0.4)] sm:p-8"><div className="mb-6 grid size-12 place-items-center bg-[#d8ff3e] text-black"><LockKeyhole className="size-5" /></div><p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#d8ff3e]">Internal access</p><h1 className="mt-1 text-2xl font-bold text-white">CVAR Timing Control</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Use the control-room password to view transponders, registrations, and private timing archives.</p><div className="mt-6 space-y-2"><Label htmlFor="control-password">Control-room password</Label><Input id="control-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-10 border-white/15 bg-black/20" required /></div>{error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}<Button type="submit" className="mt-5 h-10 w-full bg-[#d8ff3e] font-semibold text-black hover:bg-[#c8ef35]" disabled={submitting}>{submitting ? 'Signing in…' : 'Open control room'}</Button><Link href="/" className="mt-4 block text-center text-sm text-muted-foreground hover:text-white">Return to public timing</Link></form></div>;
}

function ControlLoading() {
  return <div className="mx-auto min-h-screen max-w-[1200px] px-4 py-8"><Skeleton className="mb-6 h-14 w-full" /><div className="grid gap-3 sm:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28" />)}</div><Skeleton className="mt-5 h-96" /></div>;
}

function ControlError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="grid min-h-screen place-items-center px-4"><div className="max-w-md border border-red-400/20 bg-card p-7 text-center"><Database className="mx-auto mb-4 size-8 text-red-300" /><h1 className="text-xl font-bold text-white">Control room unavailable</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">{message}</p><Button onClick={onRetry} className="mt-5">Try again</Button><Link href="/" className="mt-4 block text-sm text-muted-foreground hover:text-white">Return to public timing</Link></div></div>;
}

function InternalStat({ icon: Icon, label, value, detail }: { icon: typeof Radio; label: string; value: string; detail: string }) {
  return <div className="border border-white/10 bg-card p-4"><div className="flex items-center justify-between"><p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p><Icon className="size-4 text-[#d8ff3e]" /></div><p className="mt-2 font-mono text-2xl font-bold text-white">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;
}

function RosterRow({ row, live }: { row: LiveCar; live: boolean }) {
  return <TableRow className="border-white/10 hover:bg-white/[0.035]"><TableCell><div className="flex items-center gap-2"><span className="inline-grid min-w-11 place-items-center bg-white px-2 py-1 font-mono font-black text-black">{row.sourceNumber || row.number || '—'}</span>{row.ambiguousRegistrationNumber && <Badge variant="outline" className="border-amber-300/25 text-amber-200">duplicate entry</Badge>}</div>{row.sourceNumber && row.number && row.sourceNumber !== row.number && <p className="mt-1 font-mono text-xs text-muted-foreground">timing entry {row.number}</p>}</TableCell><TableCell><p className="font-medium text-white">{row.driver || '—'}</p><p className="text-xs text-muted-foreground">{[row.firstName, row.lastName].filter(Boolean).join(' ')}</p></TableCell><TableCell className="font-mono text-[#d8ff3e]">{row.transponderId || '—'}</TableCell><TableCell>{row.groupName || '—'}</TableCell><TableCell>{row.className || '—'}{row.classNumber != null && <span className="ml-1 text-xs text-muted-foreground">({row.classNumber})</span>}</TableCell><TableCell className="font-mono">{live ? row.position : '—'}</TableCell><TableCell className="font-mono">{row.laps ?? '—'}</TableCell><TableCell className="font-mono font-semibold text-[#d8ff3e]">{row.bestLap || '—'}</TableCell><TableCell className="font-mono">{row.bestLapNumber || '—'}</TableCell><TableCell className="font-mono">{row.lastLap || '—'}</TableCell><TableCell className="font-mono">{row.totalTime || '—'}</TableCell><TableCell className="font-mono text-xs">{row.registrationNumber || '—'}</TableCell><TableCell className="max-w-56 truncate text-muted-foreground" title={row.additionalInfo}>{row.additionalInfo || '—'}</TableCell></TableRow>;
}

function mergeRoster(registrations: Registration[], liveCars: LiveCar[]) {
  const liveByKey = new Map(liveCars.map((car) => [car.registrationKey || car.registrationNumber, car]));
  const rows: LiveCar[] = registrations.map((registration) => ({ ...registration, ...liveByKey.get(registration.registrationKey || registration.registrationNumber) }));
  const existing = new Set(rows.map((row) => row.registrationKey || row.registrationNumber));
  for (const car of liveCars) if (!existing.has(car.registrationKey || car.registrationNumber)) rows.push(car);
  return rows.sort((left, right) => String(left.number || '').localeCompare(String(right.number || ''), undefined, { numeric: true }));
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(date);
}

function formatAge(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'age unknown';
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1_000));
  if (seconds < 5) return 'live now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}
