import {
  ArrowRight,
  CalendarDays,
  Download,
  ExternalLink,
  MapPin,
  Radio,
  Trophy,
} from 'lucide-react';

import {
  CarNumber,
  FlagPill,
  LiveDot,
  type HubNavigate,
} from '@/components/hub/common';
import type { LiveTiming } from '@/hooks/use-live-timing';
import { archivedEvent, currentEvent } from '@/lib/events';
import { eventSchedule } from '@/lib/schedule';
import { formatSessionName, resultOrderForSession } from '@/lib/timing';
import {
  daysUntilEvent,
  eventDayIndex,
  eventPhase,
  sessionClock,
} from '@/lib/timing-display';

const weekendSummaries = [
  {
    title: 'Test & Tune',
    text: 'Four rounds, lead-follow sessions, and the Formula Vee feature.',
  },
  {
    title: 'Qualifying & races',
    text: 'Practice and qualifying, Races 1–2, and the Formula Ford feature.',
  },
  {
    title: 'Points races',
    text: 'Race 3 points sessions, lunch, and the final Race 4.',
  },
];

export function RaceHQ({
  timing,
  now,
  onNavigate,
}: {
  timing: LiveTiming;
  now: number | null;
  onNavigate: HubNavigate;
}) {
  const onTrack = timing.feedState === 'live' || timing.feedState === 'stale';
  const todayIndex = now === null ? -1 : eventDayIndex(now);

  return (
    <div className="hq">
      <section className="hero" aria-labelledby="hero-title">
        <img
          className="hero-image"
          src="/images/field-start.jpg"
          alt=""
          fetchPriority="high"
        />
        <div className="wrap hero-inner">
          <div className="hero-copy">
            <p className="hero-kicker">
              <span className="kicker-chip">20th annual</span>
              CVAR race weekend
            </p>
            <h1 id="hero-title" className="hero-title">
              Mike Stephens <span>Classic</span>
            </h1>
            <ul className="hero-meta">
              <li>
                <CalendarDays aria-hidden="true" /> {currentEvent.dates}
              </li>
              <li>
                <MapPin aria-hidden="true" /> {currentEvent.trackName} ·{' '}
                {currentEvent.location}
              </li>
            </ul>
            <div className="hero-actions">
              <a
                className="button button-primary button-lg"
                href={currentEvent.registrationHref}
                target="_blank"
                rel="noreferrer"
              >
                Driver registration <ExternalLink aria-hidden="true" />
              </a>
              <button
                type="button"
                className="button button-on-photo button-lg"
                onClick={() => onNavigate('timing')}
              >
                <Radio aria-hidden="true" /> Live timing
              </button>
            </div>
          </div>
          <aside className="hero-panel" aria-label="Race status">
            {onTrack ? (
              <LiveNowPanel timing={timing} onNavigate={onNavigate} />
            ) : timing.feedState === 'history' ? (
              <SavedSessionPanel timing={timing} onNavigate={onNavigate} />
            ) : (
              <CountdownPanel now={now} onNavigate={onNavigate} />
            )}
          </aside>
        </div>
        <div className="wrap">
          <dl className="hero-facts" aria-label="Track facts">
            <div>
              <dt>Lap length</dt>
              <dd>1.8 mi</dd>
            </div>
            <div>
              <dt>Turns</dt>
              <dd>10</dd>
            </div>
            <div>
              <dt>Elevation change</dt>
              <dd>80+ ft</dd>
            </div>
            <div>
              <dt>Race weekend</dt>
              <dd>3 days</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="wrap section" aria-labelledby="weekend-title">
        <div className="section-head">
          <div>
            <p className="eyebrow">Race weekend</p>
            <h2 id="weekend-title">Three days at Hallett</h2>
          </div>
          <button
            type="button"
            className="text-link"
            onClick={() => onNavigate('schedule')}
          >
            Full schedule <ArrowRight aria-hidden="true" />
          </button>
        </div>
        <div className="weekend-grid">
          {eventSchedule.map((day, index) => {
            const firstOnTrack = day.items.find(
              (item) => item.kind === 'track' && item.time,
            );
            const summary = weekendSummaries[index];
            return (
              <button
                key={day.day}
                type="button"
                className="day-card"
                data-today={index === todayIndex || undefined}
                onClick={() => onNavigate('schedule', { day: index })}
              >
                <span className="day-card-date">
                  <strong>{day.day.slice(0, 3)}</strong>
                  {day.date.replace('October', 'Oct')}
                  {index === todayIndex && (
                    <span className="today-tag">Today</span>
                  )}
                </span>
                <span className="day-card-title">{summary?.title}</span>
                <span className="day-card-text">{summary?.text}</span>
                <span className="day-card-foot">
                  {firstOnTrack
                    ? `On track ${firstOnTrack.time}`
                    : 'See run order'}
                  <ArrowRight aria-hidden="true" />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="wrap section" aria-labelledby="features-title">
        <div className="section-head">
          <div>
            <p className="eyebrow">Feature races</p>
            <h2 id="features-title">Two headline races</h2>
          </div>
        </div>
        <div className="feature-grid">
          <article className="feature-card">
            <img
              src="/cvar-grid.jpg"
              alt="A line of vintage Formula Fords through a sweeping corner"
              loading="lazy"
              style={{ objectPosition: 'center 62%' }}
            />
            <div className="feature-card-body">
              <p className="feature-when">Saturday · 20 minutes</p>
              <h3>Bulova Formula Ford Feature</h3>
              <p className="feature-prize">
                <Trophy aria-hidden="true" /> Podium finishers receive Bulova
                watches
              </p>
            </div>
          </article>
          <article className="feature-card">
            <img
              src="/images/formula-vee-hallett.jpg"
              alt="A pack of Formula Vees charging up the hill at Hallett"
              loading="lazy"
            />
            <div className="feature-card-body">
              <p className="feature-when">Friday · 20 minutes</p>
              <h3>Formula Vee Feature</h3>
              <p>
                A dedicated race for one of vintage racing’s great formulas.
              </p>
            </div>
          </article>
        </div>
      </section>

      <section
        className="wrap section two-up"
        aria-label="Results and event links"
      >
        <article className="archive-card">
          <img src="/images/closed-wheel-battle.jpg" alt="" loading="lazy" />
          <div className="archive-card-body">
            <p className="eyebrow">Results archive</p>
            <h2>{archivedEvent.shortName} results</h2>
            <p>
              {archivedEvent.dates} at {archivedEvent.trackName}.{' '}
              {timing.archiveSessions.length
                ? `${timing.archiveSessions.length} result sheets, ready to download.`
                : 'Every saved result sheet stays available.'}
            </p>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => onNavigate('results')}
            >
              Browse results <ArrowRight aria-hidden="true" />
            </button>
          </div>
        </article>
        <article className="links-card">
          <p className="eyebrow">Event info</p>
          <h2>Before you head to Hallett</h2>
          <ul className="link-list">
            <li>
              <a
                href={currentEvent.registrationHref}
                target="_blank"
                rel="noreferrer"
              >
                <span>
                  Driver registration <small>TrackRabbit</small>
                </span>
                <ExternalLink aria-hidden="true" />
              </a>
            </li>
            <li>
              <a href={currentEvent.scheduleHref} download>
                <span>
                  Official schedule <small>PDF</small>
                </span>
                <Download aria-hidden="true" />
              </a>
            </li>
            <li>
              <a
                href={currentEvent.eventPageHref}
                target="_blank"
                rel="noreferrer"
              >
                <span>
                  Official event page{' '}
                  <small>corinthianvintageautoracing.com</small>
                </span>
                <ExternalLink aria-hidden="true" />
              </a>
            </li>
          </ul>
        </article>
      </section>
    </div>
  );
}

function CountdownPanel({
  now,
  onNavigate,
}: {
  now: number | null;
  onNavigate: HubNavigate;
}) {
  const phase = now === null ? 'before' : eventPhase(now);

  if (phase === 'during')
    return (
      <div className="panel-body">
        <p className="panel-label">
          <LiveDot tone="idle" /> Race weekend underway
        </p>
        <p className="panel-title">Between sessions</p>
        <p className="panel-text">
          Live standings appear automatically when the next group takes the
          green flag.
        </p>
        <button
          type="button"
          className="button button-primary"
          onClick={() => onNavigate('timing')}
        >
          Open live timing <ArrowRight aria-hidden="true" />
        </button>
      </div>
    );

  if (phase === 'after')
    return (
      <div className="panel-body">
        <p className="panel-label">Checkered flag</p>
        <p className="panel-title">Weekend complete</p>
        <p className="panel-text">
          Result sheets from all three days are ready to download.
        </p>
        <button
          type="button"
          className="button button-primary"
          onClick={() => onNavigate('results')}
        >
          View results <ArrowRight aria-hidden="true" />
        </button>
      </div>
    );

  const days = now === null ? null : daysUntilEvent(now);
  const firstDay = eventSchedule[0];
  const driversMeeting = firstDay?.items.find((item) =>
    /drivers meeting/i.test(item.title),
  );
  const firstOnTrack = firstDay?.items.find(
    (item) => item.kind === 'track' && item.time,
  );
  return (
    <div className="panel-body">
      <p className="panel-label">Countdown</p>
      {days === 0 ? (
        <p className="countdown">
          <span className="countdown-number">Today</span>
        </p>
      ) : (
        <p className="countdown">
          <span className="countdown-number">{days ?? '—'}</span>
          <span className="countdown-unit">
            {days === 1 ? 'day' : 'days'}
            <br />
            to green
          </span>
        </p>
      )}
      {firstDay && firstOnTrack && (
        <p className="panel-text">
          First cars on track {firstDay.day}, {firstDay.date} at{' '}
          {firstOnTrack.time}.
          {driversMeeting?.time &&
            ` Drivers meeting at ${driversMeeting.time}.`}
        </p>
      )}
      <button
        type="button"
        className="button button-on-photo"
        onClick={() => onNavigate('schedule')}
      >
        <CalendarDays aria-hidden="true" /> View schedule
      </button>
    </div>
  );
}

function SavedSessionPanel({
  timing,
  onNavigate,
}: {
  timing: LiveTiming;
  onNavigate: HubNavigate;
}) {
  return (
    <div className="panel-body">
      <p className="panel-label">Viewing a saved session</p>
      <p className="panel-title">
        {formatSessionName(timing.snapshot.runName)}
      </p>
      <p className="panel-text">
        Switch back to see whatever is on track right now.
      </p>
      <button
        type="button"
        className="button button-primary"
        onClick={() => {
          timing.selectSession('live');
          onNavigate('timing');
        }}
      >
        Back to live timing <ArrowRight aria-hidden="true" />
      </button>
    </div>
  );
}

function LiveNowPanel({
  timing,
  onNavigate,
}: {
  timing: LiveTiming;
  onNavigate: HubNavigate;
}) {
  const { snapshot, feedState, secondsAgo } = timing;
  const clock = sessionClock(snapshot, feedState, secondsAgo);
  const topThree = snapshot.cars.slice(0, 3);
  const positionOrder =
    resultOrderForSession(snapshot.runName, snapshot.sessionMode) ===
    'position';

  return (
    <div className="panel-body">
      <div className="panel-live-row">
        <p className="panel-label">
          <LiveDot tone={feedState === 'live' ? 'live' : 'stale'} />
          {feedState === 'live' ? 'On track now' : 'Feed delayed'}
        </p>
        <FlagPill flag={snapshot.flag} size="sm" />
      </div>
      <p className="panel-title">{formatSessionName(snapshot.runName)}</p>
      <p className="panel-clock">
        <strong>{clock.value}</strong> {clock.label}
      </p>
      {topThree.length > 0 && (
        <ol className="panel-leaders" aria-label="Top three">
          {topThree.map((car) => (
            <li key={car.registrationKey || car.registrationNumber}>
              <span className="panel-leaders-pos">{car.position}</span>
              <CarNumber number={car.number} size="sm" />
              <span className="panel-leaders-driver">
                {car.driver || `Car ${car.number}`}
              </span>
              <span className="panel-leaders-time">
                {car.position !== 1
                  ? car.gap || '—'
                  : positionOrder
                    ? 'Leader'
                    : car.adjustedBestLap || car.bestLap || '—'}
              </span>
            </li>
          ))}
        </ol>
      )}
      <button
        type="button"
        className="button button-primary"
        onClick={() => onNavigate('timing')}
      >
        Full standings <ArrowRight aria-hidden="true" />
      </button>
    </div>
  );
}
