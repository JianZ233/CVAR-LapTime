'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  ArrowUpRight,
  CalendarDays,
  FileText,
  Flag,
  History as HistoryIcon,
  Radio,
  type LucideIcon,
} from 'lucide-react';

import {
  LiveDot,
  Roll,
  type HubNavigate,
  type HubView,
} from '@/components/hub/common';
import { RaceHQ } from '@/components/hub/race-hq';
import { ResultsView } from '@/components/hub/results-view';
import { ScheduleView } from '@/components/hub/schedule-view';
import { TimingBoard } from '@/components/hub/timing-board';
import {
  useLiveTiming,
  useNow,
  type LiveTiming,
} from '@/hooks/use-live-timing';
import { currentEvent } from '@/lib/events';
import { formatSessionName } from '@/lib/timing';
import { daysUntilEvent, eventPhase } from '@/lib/timing-display';

const NAV_ITEMS: Array<{
  view: HubView;
  label: string;
  short: string;
  icon: LucideIcon;
}> = [
  { view: 'event', label: 'Race HQ', short: 'Race HQ', icon: Flag },
  { view: 'timing', label: 'Live timing', short: 'Timing', icon: Radio },
  {
    view: 'schedule',
    label: 'Schedule',
    short: 'Schedule',
    icon: CalendarDays,
  },
  { view: 'results', label: 'Results', short: 'Results', icon: FileText },
];

const VIEW_HASH: Record<HubView, string> = {
  event: '',
  timing: '#timing',
  schedule: '#schedule',
  results: '#results',
};

function viewFromHash(hash: string): HubView {
  const view = hash.replace(/^#/, '');
  return view === 'timing' || view === 'schedule' || view === 'results'
    ? view
    : 'event';
}

export default function Home() {
  const timing = useLiveTiming();
  const now = useNow(30_000);
  const [view, setView] = useState<HubView>('event');
  const [scheduleDay, setScheduleDay] = useState<number | undefined>();

  // Keep the active view in the URL hash so links, refreshes, and the back
  // button all land on the same view.
  useEffect(() => {
    const sync = () => setView(viewFromHash(window.location.hash));
    sync();
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
    };
  }, []);

  const navigate = useCallback<HubNavigate>((next, options) => {
    const hash = VIEW_HASH[next];
    if (window.location.hash !== hash)
      window.history.pushState(
        null,
        '',
        hash || `${window.location.pathname}${window.location.search}`,
      );
    const swap = () => {
      setScheduleDay(options?.day);
      setView(next);
      window.scrollTo({ top: 0 });
    };
    // Cross-fade between views where the browser supports it. flushSync
    // lets the transition capture the new view in the same frame.
    const motionOk = !window.matchMedia('(prefers-reduced-motion: reduce)')
      .matches;
    if (motionOk && 'startViewTransition' in document)
      document.startViewTransition(() => flushSync(swap));
    else swap();
  }, []);

  const onTrack = timing.feedState === 'live' || timing.feedState === 'stale';

  return (
    <div className="hub">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="masthead">
        <div className="wrap masthead-inner">
          <ViewLink view="event" navigate={navigate} className="brand">
            <img
              src="/cvar-logo.png"
              alt="Corinthian Vintage Auto Racing"
              className="brand-logo"
              width={350}
              height={156}
            />
            {/* Phones lead with the product, desktops with the event,
                because "Live timing" already sits in the desktop nav. */}
            <span className="brand-text">
              <span className="brand-title">
                <span className="brand-wide">{currentEvent.shortName}</span>
                <span className="brand-narrow">Live timing</span>
              </span>
              <span className="brand-event">
                <span className="brand-wide">CVAR live timing · Hallett</span>
                <span className="brand-narrow">
                  {currentEvent.shortName} · Hallett
                </span>
              </span>
            </span>
          </ViewLink>
          <nav className="site-nav" aria-label="Sections">
            {NAV_ITEMS.map((item, index) => (
              <ViewLink
                key={item.view}
                view={item.view}
                navigate={navigate}
                className="site-nav-link"
                current={view === item.view}
              >
                <span className="site-nav-index" aria-hidden="true">
                  0{index + 1}
                </span>
                <Roll>{item.label}</Roll>
                {item.view === 'timing' && onTrack && (
                  <LiveDot
                    tone={timing.feedState === 'live' ? 'live' : 'stale'}
                  />
                )}
              </ViewLink>
            ))}
          </nav>
          <StatusPill timing={timing} now={now} onNavigate={navigate} />
        </div>
      </header>

      <main id="main" className="hub-main" data-view={view}>
        {view === 'event' ? (
          <RaceHQ timing={timing} now={now} onNavigate={navigate} />
        ) : view === 'timing' ? (
          <TimingBoard timing={timing} now={now} onNavigate={navigate} />
        ) : view === 'schedule' ? (
          <ScheduleView
            key={scheduleDay ?? 'auto'}
            now={now}
            initialDay={scheduleDay}
          />
        ) : (
          <ResultsView timing={timing} />
        )}
      </main>

      <footer className="footer">
        <div className="footer-checker" aria-hidden="true" />
        <div className="wrap footer-inner">
          <div className="footer-top">
            <img
              className="footer-logo"
              src="/cvar-logo.png"
              alt=""
              width={350}
              height={156}
            />
            <nav className="footer-links" aria-label="CVAR links">
              <a
                href="https://corinthianvintageautoracing.com"
                target="_blank"
                rel="noreferrer"
              >
                <Roll>CVAR website</Roll>
                <ArrowUpRight aria-hidden="true" />
              </a>
              <a
                href={currentEvent.eventPageHref}
                target="_blank"
                rel="noreferrer"
              >
                <Roll>Event page</Roll>
                <ArrowUpRight aria-hidden="true" />
              </a>
              <a
                href={currentEvent.registrationHref}
                target="_blank"
                rel="noreferrer"
              >
                <Roll>Registration</Roll>
                <ArrowUpRight aria-hidden="true" />
              </a>
            </nav>
          </div>
          {/* The big sign-off belongs to the event page; the boards and
              lists end quietly. */}
          {view === 'event' && (
            <p className="footer-wordmark" aria-hidden="true">
              <span>Corinthian</span>
              <span>
                Vintage <em className="serif">Auto</em> Racing
              </span>
            </p>
          )}
          <div className="footer-fine">
            <span>© 2026 Corinthian Vintage Auto Racing</span>
            <span>Unofficial live timing</span>
          </div>
        </div>
      </footer>

      <nav className="tab-bar" aria-label="Sections">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <ViewLink
              key={item.view}
              view={item.view}
              navigate={navigate}
              className="tab-bar-link"
              current={view === item.view}
            >
              <Icon aria-hidden="true" />
              {item.short}
              {item.view === 'timing' && onTrack && (
                <LiveDot
                  tone={timing.feedState === 'live' ? 'live' : 'stale'}
                />
              )}
            </ViewLink>
          );
        })}
      </nav>
    </div>
  );
}

function ViewLink({
  view,
  navigate,
  className,
  current = false,
  children,
}: {
  view: HubView;
  navigate: HubNavigate;
  className: string;
  current?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={VIEW_HASH[view] || '/'}
      prefetch={false}
      className={className}
      aria-current={current ? 'page' : undefined}
      onClick={(event) => {
        // Let modified clicks open the view in a new tab or window.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          return;
        event.preventDefault();
        navigate(view);
      }}
    >
      {children}
    </Link>
  );
}

function StatusPill({
  timing,
  now,
  onNavigate,
}: {
  timing: LiveTiming;
  now: number | null;
  onNavigate: HubNavigate;
}) {
  const { feedState, snapshot } = timing;

  if (feedState === 'live' || feedState === 'stale')
    return (
      <button
        type="button"
        className="status-pill"
        data-state={feedState}
        onClick={() => onNavigate('timing')}
      >
        <LiveDot tone={feedState === 'live' ? 'live' : 'stale'} />
        <span className="status-pill-strong">
          {feedState === 'live' ? 'Live' : 'Delayed'}
        </span>
        <span className="status-pill-text">
          {formatSessionName(snapshot.runName)}
        </span>
      </button>
    );

  if (feedState === 'history')
    return (
      <button
        type="button"
        className="status-pill"
        data-state="history"
        onClick={() => {
          timing.selectSession('live');
          onNavigate('timing');
        }}
      >
        <HistoryIcon aria-hidden="true" />
        <span className="status-pill-text status-pill-long">
          Saved session · Back to live
        </span>
        <span className="status-pill-text status-pill-short">Saved</span>
      </button>
    );

  const phase = now === null ? null : eventPhase(now);
  const days = now === null ? null : daysUntilEvent(now);
  // Name the moment rather than count days, so the pill never disagrees
  // with the hour-accurate countdown on Race HQ.
  const [text, shortText] =
    phase === null
      ? [currentEvent.shortDates, currentEvent.shortDates]
      : phase === 'before'
        ? days === 0
          ? ['Green flag today · 8:00 AM', 'Today']
          : days === 1
            ? ['Green flag tomorrow · 8:00 AM', 'Tomorrow']
            : ['Green flag Fri, Oct 9 · 8:00 AM', 'Oct 9']
        : phase === 'during'
          ? ['Between sessions', 'Idle']
          : ['Weekend complete', 'Complete'];

  return (
    <span
      className="status-pill"
      data-state={phase === 'before' ? 'soon' : 'idle'}
    >
      <LiveDot tone={phase === 'before' ? 'soon' : 'idle'} />
      <span className="status-pill-text status-pill-long">{text}</span>
      <span className="status-pill-text status-pill-short">{shortText}</span>
    </span>
  );
}
