import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  GreenFlagCountdown,
  Kicker,
  LiveDot,
  PositionBadge,
  PositionMovement,
  Roll,
  usePrefersReducedMotion,
  type HubNavigate,
} from '@/components/hub/common';
import type { LiveTiming } from '@/hooks/use-live-timing';
import { CURRENT_EVENT_ID, currentEvent } from '@/lib/events';
import { eventSchedule } from '@/lib/schedule';
import {
  formatSessionName,
  formatTrackSummary,
  lapTimeToMilliseconds,
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

function carKey(car: TimingCar) {
  return car.registrationKey || car.registrationNumber;
}

/**
 * Slides rows to their new place when the running order changes and flashes
 * a row when its car completes a lap. Rows register by key; the table and
 * the phone list are tracked separately because only one is visible.
 */
function useRowMotion(cars: TimingCar[], sessionKey: string) {
  const reducedMotion = usePrefersReducedMotion();
  const elements = useRef(new Map<string, HTMLElement>());
  const refs = useRef(new Map<string, (element: HTMLElement | null) => void>());
  const tops = useRef(new Map<string, number>());
  const laps = useRef(new Map<string, number>());
  const session = useRef(sessionKey);

  const register = useCallback((id: string) => {
    let ref = refs.current.get(id);
    if (!ref) {
      ref = (element) => {
        if (element) elements.current.set(id, element);
        else elements.current.delete(id);
      };
      refs.current.set(id, ref);
    }
    return ref;
  }, []);

  useLayoutEffect(() => {
    const sameSession = session.current === sessionKey;
    session.current = sessionKey;
    const nextTops = new Map<string, number>();
    const completedLap = new Set<string>();
    const nextLaps = new Map<string, number>();
    for (const car of cars) {
      const key = carKey(car);
      nextLaps.set(key, car.laps);
      const previous = laps.current.get(key);
      if (sameSession && previous !== undefined && car.laps > previous)
        completedLap.add(key);
    }
    laps.current = nextLaps;

    for (const [id, element] of elements.current) {
      const top = element.offsetTop;
      nextTops.set(id, top);
      // Hidden layouts (table on phones, list on desktop) have no box.
      if (reducedMotion || !sameSession || !element.offsetParent) continue;
      const previousTop = tops.current.get(id);
      if (previousTop !== undefined && previousTop !== top) {
        // Cars gaining places slide over the ones they passed.
        const zIndex = previousTop > top ? 2 : 1;
        element.animate(
          [
            { transform: `translateY(${previousTop - top}px)`, zIndex },
            { transform: 'translateY(0)', zIndex },
          ],
          { duration: 700, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
        );
      }
      if (completedLap.has(id.slice(2))) {
        element.classList.remove('is-new-lap');
        void element.offsetWidth;
        element.classList.add('is-new-lap');
      }
    }
    tops.current = nextTops;
  });

  return register;
}

/**
 * Seconds behind the leader for the field-spread strip, or null when it
 * cannot be measured.
 *
 * The gap column compares cars at their latest lap, so the moment the leader
 * crosses the line everyone else reads "+1 lap" until they cross too. For a
 * car one lap down, the leader's total at the previous lap (total minus last
 * lap) gives the real time gap, which keeps the strip steady through that.
 */
function spreadSeconds(
  car: TimingCar,
  leader: TimingCar,
  positionOrder: boolean,
) {
  if (car === leader) return 0;
  if (!positionOrder) {
    if (car.gap === '—') return 0;
    const ms = lapTimeToMilliseconds((car.gap || '').replace(/^\+/, ''));
    return Number.isFinite(ms) ? ms / 1_000 : null;
  }
  const lapsDown = leader.laps - car.laps;
  const leaderTotal =
    lapsDown === 0
      ? lapTimeToMilliseconds(leader.totalTime)
      : lapsDown === 1
        ? lapTimeToMilliseconds(leader.totalTime) -
          lapTimeToMilliseconds(leader.lastLap)
        : Number.NaN;
  const gap = lapTimeToMilliseconds(car.totalTime) - leaderTotal;
  return Number.isFinite(gap) && gap >= 0 ? gap / 1_000 : null;
}

/**
 * Where each car sits in the spread of the field, and whether it is within a
 * second of the car ahead: the shape of the race a column of gaps hides.
 */
function fieldSpread(cars: TimingCar[], positionOrder: boolean) {
  const leader = cars[0];
  const gaps = cars.map((car) =>
    leader ? spreadSeconds(car, leader, positionOrder) : null,
  );
  const max = Math.max(1, ...gaps.map((gap) => gap ?? 0));
  const places = new Map(
    cars.map((car, index) => {
      const gap = gaps[index];
      const ahead = index > 0 ? gaps[index - 1] : null;
      return [
        carKey(car),
        {
          x: gap === null ? 1 : gap / max,
          lapped: gap === null,
          battle:
            positionOrder &&
            gap !== null &&
            ahead !== null &&
            index > 0 &&
            gap - ahead <= 1,
        },
      ];
    }),
  );
  return { places, max };
}

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
  const [openRows, setOpenRows] = useState<Set<string>>(() => new Set());
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
  const register = useRowMotion(
    cars,
    `${selectedSessionId}|${snapshot.runId}|${snapshot.runName}`,
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
  const tone = flagTone(snapshot.flag);
  const spread = fieldSpread(snapshot.cars, positionOrder);
  const toggleRow = (key: string) =>
    setOpenRows((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="board-page">
      <section
        className="flagband"
        data-flag={tone}
        aria-label="Session status"
      >
        <div className="flagband-stripe" aria-hidden="true" />
        <div className="wrap flagband-inner">
          <div className="flagband-main">
            <div className="flagband-meta">
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
            <h1 className="flagband-session">
              <SessionTitle runName={snapshot.runName} />
            </h1>
            <p className="flagband-track">
              {snapshot.trackName} ·{' '}
              {formatTrackSummary(snapshot.trackLength, snapshot.trackName)}
            </p>
          </div>
          <div className="flagband-clock" aria-live="off">
            <span className="flagband-clock-value">{clock.value}</span>
            <span className="flagband-clock-label">{clock.label}</span>
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
            className="button button-outline board-download"
            href={resultSheetHref(
              CURRENT_EVENT_ID,
              selectedSessionId === 'live' ? '' : selectedSessionId,
            )}
            download
          >
            <Download aria-hidden="true" className="icon-drop" />
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

        <div className="board-filters">
          {classCounts.size > 1 && (
            <fieldset className="chip-row">
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
              <div className="board-summary-fastest">
                <dt>Fastest lap</dt>
                <dd>
                  <span className="lap-time is-session-best">
                    {fastestCar.bestLap}
                  </span>
                  <span className="board-summary-car">
                    #{fastestCar.number}
                    {fastestCar.driver && ` ${fastestCar.driver}`}
                  </span>
                </dd>
              </div>
            )}
            <div className="board-summary-extra">
              <dt>Cars</dt>
              <dd>
                {selectedClass === ALL_CARS
                  ? snapshot.cars.length
                  : `${cars.length} of ${snapshot.cars.length}`}
              </dd>
            </div>
            <div className="board-summary-extra">
              <dt>Order</dt>
              <dd>
                {positionOrder
                  ? 'Race position · gaps at latest lap'
                  : 'Best lap · gaps to fastest'}
              </dd>
            </div>
          </dl>
        </div>

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
                  <th scope="col" className="col-spread">
                    <span className="sr-only">
                      {positionOrder ? 'Gap to leader' : 'Gap to fastest lap'}
                    </span>
                    <span className="spread-scale" aria-hidden="true">
                      <span>{positionOrder ? 'Leader' : 'Fastest'}</span>
                      <span>+{spread.max.toFixed(1)}s</span>
                    </span>
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
                {cars.map((car) => {
                  const place = spread.places.get(carKey(car));
                  return (
                    <tr
                      key={carKey(car)}
                      ref={register(`t:${carKey(car)}`)}
                      data-podium={
                        isPodium(car.position) ? car.position : undefined
                      }
                    >
                      <td className="col-pos">
                        <span className="pos-cell">
                          <PositionBadge position={car.position} />
                          {showMovement && (
                            <PositionMovement
                              change={car.positionChange || 0}
                            />
                          )}
                        </span>
                      </td>
                      <td className="col-no">
                        <CarNumber number={car.number} />
                      </td>
                      <td className="col-driver">
                        <span className="driver-name">
                          {car.driver || `Car ${car.number}`}
                          <AdjustmentBadge car={car} />
                        </span>
                        {(car.car || car.resultAdjustment?.note) && (
                          <span className="driver-car">
                            {car.car}
                            {car.resultAdjustment?.note && (
                              <span className="driver-note">
                                {car.car && ' · '}
                                {car.resultAdjustment.note}
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="col-spread" aria-hidden="true">
                        {place && (
                          <span className="spread">
                            <span
                              className="spread-dot"
                              data-lapped={place.lapped || undefined}
                              data-battle={place.battle || undefined}
                              data-leader={car.position === 1 || undefined}
                              style={{ '--x': place.x } as React.CSSProperties}
                            />
                          </span>
                        )}
                      </td>
                      {showGroup && (
                        <td className="col-group">{car.groupName || '—'}</td>
                      )}
                      <td className="col-class">
                        {car.className ? (
                          <span className="class-tag">{car.className}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="col-num">{car.laps}</td>
                      <td className="col-num">
                        <LastLap car={car} bestMs={bestMs} />
                      </td>
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
                  );
                })}
              </tbody>
            </table>

            <ol className="standings-list" aria-label="Standings">
              {cars.map((car) => {
                const key = carKey(car);
                const open = openRows.has(key);
                const gap = gapText(car, positionOrder);
                return (
                  <li
                    key={key}
                    ref={register(`l:${key}`)}
                    data-podium={
                      isPodium(car.position) ? car.position : undefined
                    }
                    data-open={open || undefined}
                  >
                    <button
                      type="button"
                      className="sl-row"
                      aria-expanded={open}
                      onClick={() => toggleRow(key)}
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
                      <span className="sl-driver">
                        {car.driver || `Car ${car.number}`}
                      </span>
                      <span className="sl-primary">
                        {positionOrder ? (
                          gap
                        ) : (
                          <BestLap car={car} bestMs={bestMs} />
                        )}
                      </span>
                      <span className="sl-meta">
                        <AdjustmentBadge car={car} />
                        {[
                          showGroup ? car.groupName : '',
                          car.className,
                          car.car,
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'Class not listed'}
                      </span>
                      <span className="sl-secondary">
                        {positionOrder ? (
                          <BestLap car={car} bestMs={bestMs} />
                        ) : (
                          gap
                        )}
                      </span>
                    </button>
                    {open && (
                      <dl className="sl-detail">
                        <div>
                          <dt>Laps</dt>
                          <dd>{car.laps}</dd>
                        </div>
                        <div>
                          <dt>Last lap</dt>
                          <dd>
                            <LastLap car={car} bestMs={bestMs} />
                          </dd>
                        </div>
                        <div>
                          <dt>Total</dt>
                          <dd>{car.totalTime || '—'}</dd>
                        </div>
                        {car.resultAdjustment && (
                          <div className="sl-detail-wide">
                            <dt>Steward</dt>
                            <dd>
                              {formatResultAdjustment(car.resultAdjustment)}
                            </dd>
                          </div>
                        )}
                      </dl>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        ) : (
          <div className="empty-state">
            <Flag aria-hidden="true" />
            <h2>Waiting for the first timed car</h2>
            <p>Cars appear here after crossing start / finish.</p>
          </div>
        )}

        <div className="board-foot">
          <p className="board-legend" aria-label="Lap time colors">
            <span>
              <span className="legend-swatch legend-sb" /> Session best
            </span>
            <span>
              <span className="legend-swatch legend-pb" /> Personal best
            </span>
            {positionOrder && (
              <span className="board-legend-spread">
                <span className="legend-swatch legend-battle" /> Within 1s of
                car ahead
              </span>
            )}
            {[...spread.places.values()].some((place) => place.lapped) && (
              <span className="board-legend-spread">
                <span className="legend-swatch legend-lapped" /> Gap not yet
                timed
              </span>
            )}
          </p>
          <p className="board-footnote">
            Unofficial timing · Results are final only after steward review
          </p>
        </div>
      </div>
    </div>
  );
}

/** "Group 6 · Race 2", with the group on its own line on phones. */
function SessionTitle({ runName }: { runName: string }) {
  const [group, ...rest] = formatSessionName(runName).split(' · ');
  if (!rest.length) return group;
  return (
    <>
      <span className="flagband-group">{group}</span>
      <span className="flagband-sep"> · </span>
      {rest.join(' · ')}
    </>
  );
}

function gapText(car: TimingCar, positionOrder: boolean) {
  if (positionOrder) return car.position === 1 ? 'Leader' : car.gap || '—';
  return car.gap === '—' ? 'Fastest' : car.gap || '—';
}

/** Last lap, coloured like a timing screen: purple for the session best,
 * green when it is the car's own best lap. */
function LastLap({ car, bestMs }: { car: TimingCar; bestMs: number }) {
  const lastMs = lapTimeToMilliseconds(car.lastLap);
  const tone = !Number.isFinite(lastMs)
    ? undefined
    : lastMs === bestMs
      ? 'session-best'
      : car.laps > 1 && lastMs === lapTimeToMilliseconds(car.bestLap)
        ? 'personal-best'
        : undefined;
  return (
    <span
      className="lap-time lap-last"
      data-tone={tone}
      title={
        tone === 'session-best'
          ? 'Fastest lap of the session'
          : tone === 'personal-best'
            ? 'Personal best lap'
            : undefined
      }
    >
      {car.lastLap || '—'}
    </span>
  );
}

function BestLap({ car, bestMs }: { car: TimingCar; bestMs: number }) {
  const best = isSessionBest(car, bestMs);
  return (
    <span className="best-lap-cell">
      <span
        className={`lap-time lap-best ${best ? 'is-session-best' : ''}`}
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

/** Compact steward decision next to the driver; the full text is a title. */
function AdjustmentBadge({ car }: { car: TimingCar }) {
  const adjustment = car.resultAdjustment;
  if (!adjustment) return null;
  const penalty =
    adjustment.penaltySeconds > 0
      ? `+${adjustment.penaltySeconds.toFixed(3).replace(/\.?0+$/, '')}s`
      : '';
  const label =
    adjustment.status === 'PENALTY' || (!adjustment.status && penalty)
      ? `PEN ${penalty}`.trim()
      : adjustment.status ||
        (adjustment.positionOverride
          ? `P${adjustment.positionOverride}`
          : 'Steward');
  const full = formatResultAdjustment(adjustment);
  return (
    <span className="pen-badge" title={`Steward: ${full}`}>
      {label}
      <span className="sr-only">, steward decision: {full}</span>
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

const PREVIEW_ROWS = 6;

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
    <div className="standby-page">
      <section className="standby" aria-labelledby="standby-title">
        <div className="standby-media">
          <img
            src="/images/grid-waiting.jpg"
            alt="Vintage race cars lined up in the paddock, drivers waiting to go out"
          />
        </div>
        <div className="wrap standby-inner">
          <div className="standby-copy">
            <Kicker tone="light">
              Live timing · {currentEvent.shortDates}
            </Kicker>
            {phase === 'during' ? (
              <>
                <h1 id="standby-title" className="standby-title">
                  Between <em className="serif">sessions</em>
                </h1>
                <p className="standby-lede">
                  Standings appear here automatically when the next group takes
                  the green flag. No refresh needed.
                </p>
              </>
            ) : phase === 'after' ? (
              <>
                <h1 id="standby-title" className="standby-title">
                  Weekend <em className="serif">complete</em>
                </h1>
                <p className="standby-lede">
                  Thanks for following the {currentEvent.shortName}. Every
                  session’s result sheet is saved in Results.
                </p>
              </>
            ) : (
              <>
                <h1 id="standby-title" className="standby-title">
                  The board is ready.{' '}
                  <em className="serif">The track is quiet.</em>
                </h1>
                <p className="standby-lede">
                  Timing switches on automatically when the{' '}
                  {currentEvent.shortName} begins at Hallett. No refresh needed.
                </p>
              </>
            )}
            {phase === 'before' && (
              <div className="standby-countdown">
                <GreenFlagCountdown />
              </div>
            )}
            <dl className="standby-facts">
              <div>
                <dt>Status</dt>
                <dd>
                  <span className="signal" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                  Waiting for the timing feed
                </dd>
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
                <CalendarDays aria-hidden="true" />
                <Roll>View schedule</Roll>
              </button>
              <button
                type="button"
                className="button button-ghost"
                onClick={() => onNavigate('results')}
              >
                <FileText aria-hidden="true" />
                <Roll>Browse results</Roll>
              </button>
            </div>
          </div>
        </div>
      </section>
      <div className="wrap">
        <section className="preview" aria-labelledby="preview-title">
          <div className="preview-head">
            <Kicker>Board preview</Kicker>
            <h2 id="preview-title" className="display-s">
              Every car, every lap
            </h2>
            <p>
              Position, laps, last and best lap, and the gap fill in as each car
              crosses start / finish. Completed sessions become PDF result
              sheets.
            </p>
          </div>
          <div className="preview-board" aria-hidden="true">
            <div className="preview-row preview-row-head">
              <span>Pos</span>
              <span>No.</span>
              <span>Driver</span>
              <span>Class</span>
              <span>Laps</span>
              <span>Last lap</span>
              <span>Best lap</span>
              <span>Gap</span>
            </div>
            {Array.from({ length: PREVIEW_ROWS }, (_, index) => (
              <div
                key={index}
                className="preview-row"
                style={{ '--i': index } as React.CSSProperties}
              >
                <span>
                  <PositionBadge position={index + 1} />
                </span>
                <span>
                  <span className="preview-roundel" />
                </span>
                <span>
                  <span className="preview-bar" />
                </span>
                <span>
                  <span className="preview-tag" />
                </span>
                <span className="unlit">0</span>
                <span className="unlit">0:00.000</span>
                <span className="unlit">0:00.000</span>
                <span className={index ? 'unlit' : undefined}>
                  {index ? '+0.000' : 'Leader'}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function isPodium(position: number) {
  return position >= 1 && position <= 3;
}
