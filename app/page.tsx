'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  CalendarDays,
  ExternalLink,
  FileText,
  Flag,
  History as HistoryIcon,
  Radio,
  type LucideIcon,
} from 'lucide-react';

import {
  LiveDot,
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
    setScheduleDay(options?.day);
    setView(next);
    const hash = VIEW_HASH[next];
    if (window.location.hash !== hash)
      window.history.pushState(
        null,
        '',
        hash || `${window.location.pathname}${window.location.search}`,
      );
    window.scrollTo({ top: 0 });
  }, []);

  const onTrack = timing.feedState === 'live' || timing.feedState === 'stale';

  return (
    <div className="hub">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="wrap site-header-inner">
          <ViewLink view="event" navigate={navigate} className="brand">
            <img
              src="/cvar-logo.png"
              alt="Corinthian Vintage Auto Racing"
              className="brand-logo"
              width={350}
              height={156}
            />
            <span className="brand-text">
              <span className="brand-title">Live timing</span>
              <span className="brand-event">
                {currentEvent.shortName} · Hallett
              </span>
            </span>
          </ViewLink>
          <nav className="site-nav" aria-label="Sections">
            {NAV_ITEMS.map((item) => (
              <ViewLink
                key={item.view}
                view={item.view}
                navigate={navigate}
                className="site-nav-link"
                current={view === item.view}
              >
                {item.label}
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

      <main id="main" className="hub-main">
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

      <footer className="site-footer">
        <div className="wrap site-footer-inner">
          <div className="footer-brand">
            <img src="/cvar-logo.png" alt="" width={350} height={156} />
            <p>
              <strong>Corinthian Vintage Auto Racing</strong>
              <span>
                Unofficial live timing · Results are final only after steward
                review
              </span>
            </p>
          </div>
          <nav className="footer-links" aria-label="CVAR links">
            <a
              href="https://corinthianvintageautoracing.com"
              target="_blank"
              rel="noreferrer"
            >
              CVAR website <ExternalLink aria-hidden="true" />
            </a>
            <a
              href={currentEvent.eventPageHref}
              target="_blank"
              rel="noreferrer"
            >
              Event page <ExternalLink aria-hidden="true" />
            </a>
          </nav>
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
  const [text, shortText] =
    phase === null
      ? [currentEvent.shortDates, currentEvent.shortDates]
      : phase === 'before'
        ? days === 0
          ? ['Green flag today', 'Today']
          : days === 1
            ? ['Green flag tomorrow', 'Tomorrow']
            : [`Green flag in ${days} days`, `${days} days`]
        : phase === 'during'
          ? ['Between sessions', 'Idle']
          : ['Weekend complete', 'Complete'];

  return (
    <span className="status-pill" data-state="idle">
      <LiveDot tone="idle" />
      <span className="status-pill-text status-pill-long">{text}</span>
      <span className="status-pill-text status-pill-short">{shortText}</span>
    </span>
  );
}
