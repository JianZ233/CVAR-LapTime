import { useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronDown,
  Download,
  FileText,
  Flag,
  History as HistoryIcon,
  TriangleAlert,
} from 'lucide-react';

import {
  CarNumber,
  FlagPill,
  LiveDot,
  PositionBadge,
  PositionMovement,
  type HubNavigate,
} from '@/components/hub/common';
import type { LiveTiming } from '@/hooks/use-live-timing';
import { CURRENT_EVENT_ID, currentEvent } from '@/lib/events';
import { eventSchedule } from '@/lib/schedule';
import {
  formatSessionName,
  formatTrackSummary,
  resultOrderForSession,
  type TimingCar,
} from '@/lib/timing';
import {
  eventPhase,
  flagElapsedSeconds,
  flagTone,
  formatElapsed,
  formatResultAdjustment,
  formatTrackDay,
  formatTrackTime,
  groupSessionsByDay,
  isSessionBest,
  raceIsFinished,
  resultSheetHref,
  sessionBestLap,
  sessionClock,
  updatedAgoText,
  type TimingSessionSummary,
} from '@/lib/timing-display';

const ALL_CARS = 'All cars';

export function TimingBoard({
  timing,
  now,
  onNavigate,
}: {
  timing: LiveTiming;
  now: number | null;
  onNavigate: HubNavigate;
}) {
  const {
    snapshot,
    feedState,
    secondsAgo,
    sessions,
    liveSessionId,
    selectedSessionId,
    selectSession,
  } = timing;
  const [activeClass, setActiveClass] = useState(ALL_CARS);
  const classCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const car of snapshot.cars)
      if (car.className)
        counts.set(car.className, (counts.get(car.className) || 0) + 1);
    return counts;
  }, [snapshot.cars]);
  const selectedClass = classCounts.has(activeClass) ? activeClass : ALL_CARS;
  const cars = useMemo(
    () =>
      selectedClass === ALL_CARS
        ? snapshot.cars
        : snapshot.cars.filter((car) => car.className === selectedClass),
    [selectedClass, snapshot.cars],
  );

  if (feedState === 'demo')
    return (
      <TimingStandby
        now={now}
        sessions={sessions}
        onSelectSession={selectSession}
        onNavigate={onNavigate}
      />
    );

  const positionOrder =
    resultOrderForSession(snapshot.runName, snapshot.sessionMode) ===
    'position';
  const showMovement =
    positionOrder && feedState !== 'history' && !raceIsFinished(snapshot.flag);
  const showGroup =
    new Set(snapshot.cars.map((car) => car.groupName).filter(Boolean)).size > 1;
  const bestMs = sessionBestLap(snapshot.cars);
  const fastestCar = snapshot.cars.find((car) => isSessionBest(car, bestMs));
  const clock = sessionClock(snapshot, feedState, secondsAgo);
  const selectedSession = sessions.find(
    (session) => session.id === selectedSessionId,
  );

  return (
    <div className="board-page">
      <section
        className="board-status"
        data-flag={flagTone(snapshot.flag)}
        aria-label="Session status"
      >
        <div className="wrap board-status-inner">
          <div className="board-status-main">
            <div className="board-status-top">
              <FlagPill
                flag={snapshot.flag}
                detail={formatElapsed(
                  flagElapsedSeconds(snapshot, feedState, secondsAgo),
                )}
              />
              <FeedIndicator
                feedState={feedState}
                secondsAgo={secondsAgo}
                savedAt={selectedSession?.startedAt}
              />
            </div>
            <h1 className="board-session">
              {formatSessionName(snapshot.runName)}
            </h1>
            <p className="board-track">
              {snapshot.trackName} ·{' '}
              {formatTrackSummary(snapshot.trackLength, snapshot.trackName)}
            </p>
          </div>
          <div className="board-clock" aria-live="off">
            <span className="board-clock-value">{clock.value}</span>
            <span className="board-clock-label">{clock.label}</span>
          </div>
        </div>
      </section>

      <div className="wrap">
        <div className="board-toolbar">
          <SessionPicker
            sessions={sessions}
            liveSessionId={liveSessionId}
            selectedSessionId={selectedSessionId}
            onChange={selectSession}
          />
          <a
            className="button button-secondary board-download"
            href={resultSheetHref(
              CURRENT_EVENT_ID,
              selectedSessionId === 'live' ? '' : selectedSessionId,
            )}
            download
          >
            <Download aria-hidden="true" />
            <span className="board-download-long">Result sheet</span> PDF
          </a>
        </div>

        {feedState === 'history' && (
          <div className="notice">
            <HistoryIcon aria-hidden="true" />
            <p>You’re viewing a saved result, not live timing.</p>
            <button type="button" onClick={() => selectSession('live')}>
              Back to live
            </button>
          </div>
        )}
        {feedState === 'stale' && (
          <div className="notice notice-warn" aria-live="polite">
            <TriangleAlert aria-hidden="true" />
            <p>
              The timing feed is delayed. Standings refresh automatically when
              it reconnects.
            </p>
          </div>
        )}

        {classCounts.size > 1 && (
          <fieldset className="chip-row board-classes">
            <legend className="sr-only">Filter by class</legend>
            <button
              type="button"
              className="chip"
              aria-pressed={selectedClass === ALL_CARS}
              onClick={() => setActiveClass(ALL_CARS)}
            >
              All cars{' '}
              <span className="chip-count">{snapshot.cars.length}</span>
            </button>
            {[...classCounts].map(([className, count]) => (
              <button
                key={className}
                type="button"
                className="chip"
                aria-pressed={selectedClass === className}
                onClick={() => setActiveClass(className)}
              >
                {className} <span className="chip-count">{count}</span>
              </button>
            ))}
          </fieldset>
        )}

        <dl className="board-summary">
          {fastestCar && (
            <div>
              <dt>Fastest lap</dt>
              <dd>
                <span className="lap-best is-session-best">
                  {fastestCar.bestLap}
                </span>{' '}
                #{fastestCar.number}{' '}
                {fastestCar.driver && (
                  <span className="board-summary-muted">
                    {fastestCar.driver}
                  </span>
                )}
              </dd>
            </div>
          )}
          <div>
            <dt>Cars</dt>
            <dd>
              {selectedClass === ALL_CARS
                ? snapshot.cars.length
                : `${cars.length} of ${snapshot.cars.length}`}
            </dd>
          </div>
          <div>
            <dt>Order</dt>
            <dd>
              {positionOrder
                ? 'Race position · gaps at latest lap'
                : 'Best lap · gaps to fastest'}
            </dd>
          </div>
        </dl>

        {cars.length > 0 ? (
          <div className="standings-card">
            <table className="standings">
              <thead>
                <tr>
                  <th scope="col" className="col-pos">
                    Pos
                  </th>
                  <th scope="col" className="col-no">
                    No.
                  </th>
                  <th scope="col" className="col-driver">
                    Driver
                  </th>
                  {showGroup && (
                    <th scope="col" className="col-group">
                      Group
                    </th>
                  )}
                  <th scope="col" className="col-class">
                    Class
                  </th>
                  <th scope="col" className="col-num">
                    Laps
                  </th>
                  <th scope="col" className="col-num">
                    Last lap
                  </th>
                  <th scope="col" className="col-num">
                    Best lap
                  </th>
                  <th scope="col" className="col-num">
                    {positionOrder ? 'Gap' : 'Gap to best'}
                  </th>
                  <th scope="col" className="col-num col-total">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {cars.map((car) => (
                  <tr
                    key={car.registrationKey || car.registrationNumber}
                    data-podium={isPodium(car.position) || undefined}
                  >
                    <td className="col-pos">
                      <span className="pos-cell">
                        <PositionBadge position={car.position} />
                        {showMovement && (
                          <PositionMovement change={car.positionChange || 0} />
                        )}
                      </span>
                    </td>
                    <td className="col-no">
                      <CarNumber number={car.number} />
                    </td>
                    <td className="col-driver">
                      <span className="driver-name">
                        {car.driver || `Car ${car.number}`}
                      </span>
                      {car.car && <span className="driver-car">{car.car}</span>}
                      <Adjustment car={car} />
                    </td>
                    {showGroup && (
                      <td className="col-group">{car.groupName || '—'}</td>
                    )}
                    <td className="col-class">{car.className || '—'}</td>
                    <td className="col-num">{car.laps}</td>
                    <td className="col-num col-muted">{car.lastLap || '—'}</td>
                    <td className="col-num">
                      <BestLap car={car} bestMs={bestMs} />
                    </td>
                    <td className="col-num col-muted">
                      {gapText(car, positionOrder)}
                    </td>
                    <td className="col-num col-muted col-total">
                      {car.totalTime || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ol className="standings-list" aria-label="Standings">
              {cars.map((car) => (
                <li
                  key={car.registrationKey || car.registrationNumber}
                  data-podium={isPodium(car.position) || undefined}
                >
                  <span className="sl-pos">
                    <PositionBadge position={car.position} />
                    {showMovement && (
                      <PositionMovement change={car.positionChange || 0} />
                    )}
                  </span>
                  <span className="sl-no">
                    <CarNumber number={car.number} size="sm" />
                  </span>
                  <p className="sl-driver">
                    {car.driver || `Car ${car.number}`}
                  </p>
                  <p className="sl-meta">
                    {[showGroup ? car.groupName : '', car.className, car.car]
                      .filter(Boolean)
                      .join(' · ') || 'Class not listed'}
                  </p>
                  <span className="sl-best">
                    <BestLap car={car} bestMs={bestMs} />
                  </span>
                  <span className="sl-gap">{gapText(car, positionOrder)}</span>
                  <p className="sl-laps">
                    {car.laps} {car.laps === 1 ? 'lap' : 'laps'} · Last{' '}
                    {car.lastLap || '—'} · Total {car.totalTime || '—'}
                  </p>
                  {car.resultAdjustment && (
                    <span className="sl-adjustment">
                      <Adjustment car={car} />
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <div className="empty-state">
            <Flag aria-hidden="true" />
            <h2>Waiting for the first timed car</h2>
            <p>Cars appear here after crossing start / finish.</p>
          </div>
        )}

        <p className="board-footnote">
          Unofficial timing · Results are final only after steward review
        </p>
      </div>
    </div>
  );
}

function gapText(car: TimingCar, positionOrder: boolean) {
  if (positionOrder) return car.position === 1 ? 'Leader' : car.gap || '—';
  return car.gap === '—' ? 'Fastest' : car.gap || '—';
}

function BestLap({ car, bestMs }: { car: TimingCar; bestMs: number }) {
  const best = isSessionBest(car, bestMs);
  return (
    <span className="best-lap-cell">
      <span
        className={`lap-best ${best ? 'is-session-best' : ''}`}
        title={best ? 'Fastest lap of the session' : undefined}
      >
        {car.adjustedBestLap || car.bestLap || '—'}
      </span>
      {car.adjustedBestLap && (
        <span className="lap-raw">raw {car.bestLap}</span>
      )}
    </span>
  );
}

function Adjustment({ car }: { car: TimingCar }) {
  if (!car.resultAdjustment) return null;
  return (
    <span className="adjustment">
      Steward: {formatResultAdjustment(car.resultAdjustment)}
    </span>
  );
}

function FeedIndicator({
  feedState,
  secondsAgo,
  savedAt,
}: {
  feedState: LiveTiming['feedState'];
  secondsAgo: number;
  savedAt?: string;
}) {
  if (feedState === 'history')
    return (
      <span className="feed-indicator">
        <HistoryIcon aria-hidden="true" /> Saved session
        {savedAt &&
          ` · ${formatTrackDay(savedAt)}, ${formatTrackTime(savedAt)}`}
      </span>
    );
  return (
    <span className="feed-indicator" data-state={feedState}>
      <LiveDot tone={feedState === 'live' ? 'live' : 'stale'} />
      {feedState === 'live' ? 'Live' : 'Delayed'}
      <span className="feed-indicator-age">· {updatedAgoText(secondsAgo)}</span>
    </span>
  );
}

function SessionPicker({
  sessions,
  liveSessionId,
  selectedSessionId,
  onChange,
  includeLive = true,
  label = 'Session',
}: {
  sessions: TimingSessionSummary[];
  liveSessionId: string;
  selectedSessionId: string;
  onChange: (sessionId: string) => void;
  includeLive?: boolean;
  label?: string;
}) {
  const liveSession = sessions.find((session) => session.id === liveSessionId);
  const days = groupSessionsByDay(
    sessions.filter((session) => session.id !== liveSessionId),
  );
  return (
    <label className="field session-picker">
      <span className="field-label">{label}</span>
      <span className="select-wrap">
        <select
          value={selectedSessionId}
          onChange={(event) => onChange(event.target.value || 'live')}
        >
          {includeLive ? (
            <option value="live">
              ● Live ·{' '}
              {formatSessionName(liveSession?.runName || 'Current session')}
            </option>
          ) : (
            <option value="live" disabled>
              Choose a saved session…
            </option>
          )}
          {days.map((day) => (
            <optgroup key={day.key} label={day.label}>
              {day.sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {formatSessionName(session.runName)} ·{' '}
                  {formatTrackTime(session.startedAt)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <ChevronDown aria-hidden="true" />
      </span>
    </label>
  );
}

function TimingStandby({
  now,
  sessions,
  onSelectSession,
  onNavigate,
}: {
  now: number | null;
  sessions: TimingSessionSummary[];
  onSelectSession: (sessionId: string) => void;
  onNavigate: HubNavigate;
}) {
  const phase = now === null ? 'before' : eventPhase(now);
  const firstDay = eventSchedule[0];
  const firstOnTrack = firstDay?.items.find(
    (item) => item.kind === 'track' && item.time,
  );

  return (
    <div className="wrap page">
      <section className="standby" aria-labelledby="standby-title">
        <div className="standby-media">
          <img
            src="/images/grid-waiting.jpg"
            alt="Vintage race cars lined up in the paddock, drivers waiting to go out"
          />
        </div>
        <div className="standby-copy">
          <p className="eyebrow">
            <LiveDot tone="idle" /> Live timing · {currentEvent.shortDates}
          </p>
          {phase === 'during' ? (
            <>
              <h1 id="standby-title">Between sessions</h1>
              <p className="standby-lede">
                Standings appear here automatically when the next group takes
                the green flag. No refresh needed.
              </p>
            </>
          ) : phase === 'after' ? (
            <>
              <h1 id="standby-title">Weekend complete</h1>
              <p className="standby-lede">
                Thanks for following the {currentEvent.shortName}. Every
                session’s result sheet is saved in Results.
              </p>
            </>
          ) : (
            <>
              <h1 id="standby-title">
                The board is ready. The track is quiet.
              </h1>
              <p className="standby-lede">
                Timing switches on automatically when the{' '}
                {currentEvent.shortName} begins at Hallett. No refresh needed.
              </p>
            </>
          )}
          <dl className="standby-facts">
            <div>
              <dt>Status</dt>
              <dd>Waiting for the timing feed</dd>
            </div>
            {phase === 'before' && firstDay && firstOnTrack && (
              <div>
                <dt>First session</dt>
                <dd>
                  {firstDay.day.slice(0, 3)},{' '}
                  {firstDay.date.replace('October', 'Oct')} ·{' '}
                  {firstOnTrack.time}
                </dd>
              </div>
            )}
          </dl>
          {sessions.length > 0 && (
            <SessionPicker
              sessions={sessions}
              liveSessionId=""
              selectedSessionId="live"
              onChange={onSelectSession}
              includeLive={false}
              label="Review a saved session"
            />
          )}
          <div className="standby-actions">
            <button
              type="button"
              className="button button-primary"
              onClick={() => onNavigate('schedule')}
            >
              <CalendarDays aria-hidden="true" /> View schedule
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => onNavigate('results')}
            >
              <FileText aria-hidden="true" /> Browse results
            </button>
          </div>
        </div>
      </section>
      <ul className="standby-features">
        <li>
          <strong>Automatic</strong>
          <span>
            Live standings appear as soon as the first session is published.
          </span>
        </li>
        <li>
          <strong>Every session saved</strong>
          <span>
            Completed classifications become downloadable PDF result sheets.
          </span>
        </li>
        <li>
          <strong>Built for trackside</strong>
          <span>Follow position, laps, best lap, and gap from your phone.</span>
        </li>
      </ul>
    </div>
  );
}

function isPodium(position: number) {
  return position >= 1 && position <= 3;
}
