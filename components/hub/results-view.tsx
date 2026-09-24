import { useMemo, useState } from 'react';
import { Download, FileText } from 'lucide-react';

import { FlagPill, LiveDot, PageHeading } from '@/components/hub/common';
import type { LiveTiming } from '@/hooks/use-live-timing';
import {
  ARCHIVE_EVENT_ID,
  CURRENT_EVENT_ID,
  archivedEvent,
  currentEvent,
} from '@/lib/events';
import { formatSessionName } from '@/lib/timing';
import {
  compareGroups,
  flagLabel,
  formatTrackTime,
  groupSessionsByDay,
  resultSheetHref,
  sessionTitleParts,
  type TimingSessionSummary,
} from '@/lib/timing-display';

type EventTab = 'current' | 'archive';

export function ResultsView({ timing }: { timing: LiveTiming }) {
  const {
    snapshot,
    feedState,
    sessions,
    archiveSessions,
    archiveLoaded,
    liveSessionId,
  } = timing;
  const onTrack = feedState === 'live' || feedState === 'stale';
  const currentSessions = onTrack
    ? sessions.filter((session) => session.id !== liveSessionId)
    : sessions;
  const [pickedTab, setPickedTab] = useState<EventTab | null>(null);
  const tab: EventTab =
    pickedTab ?? (currentSessions.length || onTrack ? 'current' : 'archive');

  return (
    <div className="wrap page">
      <PageHeading eyebrow="Result sheets" title="Results">
        Printable PDF classifications for every timed session. Results are
        unofficial until steward review.
      </PageHeading>

      <fieldset className="event-switch">
        <legend className="sr-only">Choose event</legend>
        <button
          type="button"
          aria-pressed={tab === 'current'}
          onClick={() => setPickedTab('current')}
        >
          <strong>{currentEvent.shortName}</strong>
          <span>
            {currentEvent.shortDates}
            <span className="event-switch-track"> · Hallett</span>
          </span>
          <em>
            {currentSessions.length}
            <span className="sr-only"> sheets</span>
          </em>
        </button>
        <button
          type="button"
          aria-pressed={tab === 'archive'}
          onClick={() => setPickedTab('archive')}
        >
          <strong>{archivedEvent.shortName}</strong>
          <span>
            {archivedEvent.shortDates}
            <span className="event-switch-track"> · Eagles Canyon</span>
          </span>
          <em>
            {archiveSessions.length}
            <span className="sr-only"> sheets</span>
          </em>
        </button>
      </fieldset>

      {tab === 'current' ? (
        <>
          {onTrack && (
            <article className="current-sheet">
              <div className="current-sheet-copy">
                <p className="current-sheet-label">
                  <LiveDot tone={feedState === 'live' ? 'live' : 'stale'} />
                  Current timing
                </p>
                <h2>{formatSessionName(snapshot.runName)}</h2>
                <p>
                  {snapshot.cars.length} cars · {flagLabel(snapshot.flag)} flag
                </p>
              </div>
              <a
                className="button button-primary"
                href={resultSheetHref(CURRENT_EVENT_ID, '')}
                download
              >
                <Download aria-hidden="true" /> Download PDF
              </a>
            </article>
          )}
          <SessionSheets
            key="current"
            eventId={CURRENT_EVENT_ID}
            sessions={currentSessions}
            emptyTitle="October result sheets will appear here"
            emptyText="Timing is ready. The first sheet is created as soon as a session records cars on track."
          />
        </>
      ) : (
        <SessionSheets
          key="archive"
          eventId={ARCHIVE_EVENT_ID}
          sessions={archiveSessions}
          loading={!archiveLoaded}
          emptyTitle="The Canyon Classic archive is unavailable"
          emptyText="Saved sheets will appear when timing storage is reachable."
          extra={
            <a className="text-link" href={archivedEvent.scheduleHref} download>
              <Download aria-hidden="true" /> Official schedule
            </a>
          }
        />
      )}
    </div>
  );
}

function SessionSheets({
  eventId,
  sessions,
  loading = false,
  emptyTitle,
  emptyText,
  extra,
}: {
  eventId: string;
  sessions: TimingSessionSummary[];
  loading?: boolean;
  emptyTitle: string;
  emptyText: string;
  extra?: React.ReactNode;
}) {
  const [group, setGroup] = useState('all');
  const groups = useMemo(
    () =>
      [...new Set(sessions.flatMap((session) => session.groups || []))].sort(
        compareGroups,
      ),
    [sessions],
  );
  const selectedGroup = groups.includes(group) ? group : 'all';
  const visible =
    selectedGroup === 'all'
      ? sessions
      : sessions.filter((session) => session.groups?.includes(selectedGroup));
  const days = groupSessionsByDay(visible);

  if (loading)
    return (
      <div className="empty-state" aria-busy="true">
        <FileText aria-hidden="true" />
        <h2>Loading result sheets…</h2>
      </div>
    );

  if (!sessions.length)
    return (
      <div className="empty-state">
        <FileText aria-hidden="true" />
        <h2>{emptyTitle}</h2>
        <p>{emptyText}</p>
      </div>
    );

  return (
    <>
      <div className="filter-bar">
        {groups.length > 1 && (
          <fieldset className="chip-row">
            <legend className="sr-only">Filter by run group</legend>
            <button
              type="button"
              className="chip"
              aria-pressed={selectedGroup === 'all'}
              onClick={() => setGroup('all')}
            >
              All groups
            </button>
            {groups.map((name) => (
              <button
                key={name}
                type="button"
                className="chip"
                aria-pressed={selectedGroup === name}
                onClick={() => setGroup(name)}
              >
                {name}
              </button>
            ))}
          </fieldset>
        )}
        <div className="filter-bar-meta">
          <span>
            {visible.length} {visible.length === 1 ? 'sheet' : 'sheets'} · times
            in track time (CT)
          </span>
          {extra}
        </div>
      </div>

      {days.map((day) => (
        <section key={day.key} className="result-day">
          <h2 className="result-day-title">
            {day.label}
            <span>
              {day.sessions.length}{' '}
              {day.sessions.length === 1 ? 'sheet' : 'sheets'}
            </span>
          </h2>
          <ul className="result-list">
            {day.sessions.map((session) => {
              const { title, group: groupLabel } = sessionTitleParts(
                session.runName,
                session.groups,
              );
              const time = formatTrackTime(session.startedAt);
              return (
                <li key={session.id} className="result-row">
                  <span className="result-time">{time}</span>
                  <div className="result-main">
                    <p className="result-title">{title}</p>
                    <p className="result-meta">
                      {[
                        groupLabel,
                        `${session.carCount} ${session.carCount === 1 ? 'car' : 'cars'}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      <span className="result-meta-mobile">
                        {time && ` · ${time}`}
                        {session.flag && ` · ${flagLabel(session.flag)}`}
                      </span>
                    </p>
                  </div>
                  <span className="result-flag">
                    {session.flag ? (
                      <FlagPill flag={session.flag} size="sm" />
                    ) : (
                      'Recorded'
                    )}
                  </span>
                  <a
                    className="button button-secondary button-sm result-download"
                    href={resultSheetHref(eventId, session.id)}
                    download
                    aria-label={`Download PDF result sheet for ${formatSessionName(session.runName)}`}
                  >
                    <Download aria-hidden="true" />
                    <span>PDF</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}
