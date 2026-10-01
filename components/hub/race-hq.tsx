import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Download,
  Flag,
  Radio,
  Trophy,
} from 'lucide-react';

import {
  CarNumber,
  FlagPill,
  GreenFlagCountdown,
  Kicker,
  LiveDot,
  Marquee,
  Roll,
  type HubNavigate,
} from '@/components/hub/common';
import { TrackMap } from '@/components/hub/track-map';
import type { LiveTiming } from '@/hooks/use-live-timing';
import { archivedEvent, currentEvent } from '@/lib/events';
import { eventSchedule, type ScheduleItem } from '@/lib/schedule';
import { formatSessionName, resultOrderForSession } from '@/lib/timing';
import {
  eventDayIndex,
  eventPhase,
  flagLabel,
  isSessionBest,
  sessionBestLap,
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
    text: 'Hardship laps, Race 3 for points, then the final Race 4.',
  },
];

const weekendTicker = [
  'Drivers meeting 7:00 AM · Pavilion',
  'Marshal meeting 7:15 AM · 2nd floor tower',
  'Grid calls by text, PA & 464.5000',
  'Fri · Test & Tune · Formula Vee Feature',
  'Sat · Qualifying · Races 1 & 2 · Bulova Formula Ford Feature',
  'Sun · Race 3 points · Race 4',
];

/**
 * The ticker carries real information: the running order while cars are on
 * track, weekend logistics the rest of the time.
 */
function tickerItems(timing: LiveTiming, now: number | null) {
  const { snapshot, feedState, secondsAgo } = timing;
  if (feedState === 'live' || feedState === 'stale') {
    const clock = sessionClock(snapshot, feedState, secondsAgo);
    const bestMs = sessionBestLap(snapshot.cars);
    const fastest = snapshot.cars.find((car) => isSessionBest(car, bestMs));
    const surname = (driver: string) => driver.split(' ').at(-1) || driver;
    return [
      `${flagLabel(snapshot.flag)} flag · ${formatSessionName(snapshot.runName)}`,
      `${clock.value} ${clock.label.toLowerCase()}`,
      ...snapshot.cars
        .slice(0, 5)
        .map(
          (car) =>
            `P${car.position} #${car.number} ${surname(car.driver || `Car ${car.number}`)}${car.position > 1 && car.gap ? ` ${car.gap}` : ''}`,
        ),
      ...(fastest
        ? [`Fastest lap ${fastest.bestLap} · #${fastest.number}`]
        : []),
    ];
  }
  const phase = now === null ? 'before' : eventPhase(now);
  const lead =
    phase === 'during'
      ? 'Between sessions · standings appear automatically'
      : phase === 'after'
        ? 'Weekend complete · every result sheet is in Results'
        : 'Green flag Friday, October 9 · 8:00 AM';
  return [lead, ...weekendTicker];
}

/** Timed sessions, features, the social, and the day's final session. */
function dayHighlights(items: ScheduleItem[]) {
  const track = items.filter((item) => item.kind === 'track');
  const last = track.at(-1);
  return items
    .filter(
      (item) =>
        (item.kind === 'track' &&
          (item.time || /feature/i.test(item.title) || item === last)) ||
        item.kind === 'social',
    )
    .slice(0, 3);
}

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
        <div className="hero-media">
          <img src="/images/field-start.jpg" alt="" fetchPriority="high" />
        </div>
        <div className="wrap hero-strip">
          <span>
            <em className="serif">
              <span className="hero-strip-long">
                Corinthian Vintage Auto Racing presents
              </span>
              <span className="hero-strip-short">CVAR presents</span>
            </em>
          </span>
          <span className="hero-strip-mid">
            {currentEvent.trackName} · {currentEvent.location}
          </span>
          <span className="hero-strip-end">36°13′N · 96°35′W</span>
          <span className="hero-strip-dates">{currentEvent.shortDates}</span>
        </div>
        <div className="wrap hero-body">
          {/* The anniversary mark steps aside while cars are on track. */}
          {!onTrack && (
            <p className="hero-badge" aria-hidden="true">
              20<span>th</span>
            </p>
          )}
          <h1 id="hero-title" className="hero-title">
            <span className="mask-line">
              <span>Mike Stephens</span>
            </span>
            <span className="hero-title-row">
              <span className="mask-line hero-title-accent">
                <span>Classic</span>
              </span>
              <span className="hero-dates">
                <span>Oct</span>
                <strong>09–11</strong>
                <span>2026</span>
              </span>
            </span>
          </h1>
          <div className="hero-foot">
            <div className="hero-actions">
              {/* While cars are on track the console leads, so
                  registration steps back and its timing link moves there. */}
              <a
                className={`button button-lg ${onTrack ? 'button-ghost' : 'button-primary'}`}
                href={currentEvent.registrationHref}
                target="_blank"
                rel="noreferrer"
              >
                <Roll>Driver registration</Roll>
                <ArrowUpRight aria-hidden="true" />
              </a>
              {!onTrack && (
                <button
                  type="button"
                  className="button button-ghost button-lg"
                  onClick={() => onNavigate('timing')}
                >
                  <Radio aria-hidden="true" />
                  <Roll>Live timing</Roll>
                </button>
              )}
            </div>
            <aside className="console" aria-label="Race status">
              {onTrack ? (
                <LiveNowPanel timing={timing} onNavigate={onNavigate} />
              ) : timing.feedState === 'history' ? (
                <SavedSessionPanel timing={timing} onNavigate={onNavigate} />
              ) : (
                <CountdownPanel now={now} onNavigate={onNavigate} />
              )}
            </aside>
          </div>
        </div>
        <Marquee items={tickerItems(timing, now)} />
      </section>

      <section className="circuit" aria-labelledby="circuit-title">
        <div className="wrap circuit-grid">
          <header className="circuit-copy reveal">
            <Kicker index="01">The circuit</Kicker>
            <h2 id="circuit-title" className="display-m">
              Hallett <em className="serif">in ten turns</em>
            </h2>
            <p className="lede">
              Rolling Oklahoma hills, 35 miles west of Tulsa. Ten named corners
              and more than 80 feet of elevation change in 1.8 miles, from
              Deadhorse all the way round to Richard Calhoun.
            </p>
            <dl className="stat-grid">
              <div>
                <dt>Lap length</dt>
                <dd>
                  1.8<small>mi</small>
                </dd>
              </div>
              <div>
                <dt>Turns</dt>
                <dd>10</dd>
              </div>
              <div>
                <dt>Elevation</dt>
                <dd>
                  80<small>ft+</small>
                </dd>
              </div>
              <div>
                <dt>Race days</dt>
                <dd>03</dd>
              </div>
            </dl>
          </header>
          <div className="circuit-map reveal">
            <TrackMap
              live={onTrack}
              crossings={timing.snapshot.cars.reduce(
                (total, car) => total + car.laps,
                0,
              )}
            />
          </div>
        </div>
      </section>

      <section className="wrap section" aria-labelledby="weekend-title">
        <div className="section-head reveal">
          <div>
            <Kicker index="02">Race weekend</Kicker>
            <h2 id="weekend-title" className="display-m">
              Three days <em className="serif">at Hallett</em>
            </h2>
          </div>
          <button
            type="button"
            className="arrow-link"
            onClick={() => onNavigate('schedule')}
          >
            <Roll>Full schedule</Roll>
            <ArrowRight aria-hidden="true" />
          </button>
        </div>
        <ol className="program">
          {eventSchedule.map((day, index) => {
            const summary = weekendSummaries[index];
            const [month, date] = day.date.split(' ');
            return (
              <li key={day.day} className="reveal">
                <button
                  type="button"
                  className="program-day"
                  data-today={index === todayIndex || undefined}
                  onClick={() => onNavigate('schedule', { day: index })}
                >
                  <span className="program-date">
                    <span className="program-num" aria-hidden="true">
                      {date?.padStart(2, '0')}
                    </span>
                    <span className="program-weekday">
                      {day.day}
                      <span>
                        {month} {date}
                      </span>
                      {index === todayIndex && (
                        <span className="today-tag">Today</span>
                      )}
                    </span>
                  </span>
                  <span className="program-title">{summary?.title}</span>
                  <span className="program-text">{summary?.text}</span>
                  <span className="program-highlights">
                    {dayHighlights(day.items).map((item) => (
                      <span
                        key={item.title}
                        className="program-highlight"
                        data-feature={/feature/i.test(item.title) || undefined}
                      >
                        <span className="program-highlight-time">
                          {item.time || 'Later'}
                        </span>
                        <span className="program-highlight-title">
                          {item.title}
                        </span>
                      </span>
                    ))}
                  </span>
                  <span className="program-cta">
                    Run order <ArrowRight aria-hidden="true" />
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="features-band" aria-labelledby="features-title">
        <div className="wrap">
          <div className="section-head reveal">
            <div>
              <Kicker index="03" tone="light">
                Feature races
              </Kicker>
              <h2 id="features-title" className="display-m">
                Two races <em className="serif">worth the drive</em>
              </h2>
            </div>
          </div>
          <div className="features">
            <article className="feature reveal">
              <div className="feature-media">
                <img
                  src="/images/formula-vee-hallett.jpg"
                  alt="A pack of Formula Vees charging up the hill at Hallett"
                  loading="lazy"
                />
              </div>
              <div className="feature-body">
                <p className="feature-index">
                  <span>Friday</span>
                  <span>20 min</span>
                </p>
                <h3>Formula Vee</h3>
                <p>
                  A dedicated race for one of vintage racing’s great formulas.
                </p>
                <p className="feature-meta">
                  <Flag aria-hidden="true" /> Closes Friday’s running
                </p>
              </div>
            </article>
            <article className="feature reveal">
              <div className="feature-media">
                <img
                  src="/cvar-grid.jpg"
                  alt="A line of vintage Formula Fords through a sweeping corner"
                  loading="lazy"
                />
              </div>
              <div className="feature-body">
                <p className="feature-index">
                  <span>Saturday</span>
                  <span>20 min</span>
                </p>
                <h3>Bulova Formula Ford</h3>
                <p>
                  Saturday’s headline race, run last before the Party at the
                  Pavilion.
                </p>
                <p className="feature-meta">
                  <Trophy aria-hidden="true" /> Podium finishers receive Bulova
                  watches
                </p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section
        className="wrap section info"
        aria-label="Results and event links"
      >
        <article className="archive reveal">
          <div className="archive-media">
            <img src="/images/closed-wheel-battle.jpg" alt="" loading="lazy" />
          </div>
          <div className="archive-body">
            <Kicker index="04">Results archive</Kicker>
            <h2 className="display-s">{archivedEvent.shortName}</h2>
            <p>
              {archivedEvent.dates} at {archivedEvent.trackName}.
            </p>
            <p className="archive-count">
              <strong>
                {timing.archiveSessions.length
                  ? String(timing.archiveSessions.length).padStart(2, '0')
                  : '—'}
              </strong>
              <span>
                result sheets
                <br />
                ready to download
              </span>
            </p>
            <button
              type="button"
              className="button button-dark"
              onClick={() => onNavigate('results')}
            >
              <Roll>Browse results</Roll>
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
        </article>
        <article className="links reveal">
          <Kicker index="05">Before you go</Kicker>
          <h2 className="display-s">Paddock essentials</h2>
          <ul className="index-list">
            <li>
              <a
                href={currentEvent.registrationHref}
                target="_blank"
                rel="noreferrer"
              >
                <span className="index-list-n">A</span>
                <span className="index-list-label">
                  Driver registration <small>TrackRabbit</small>
                </span>
                <ArrowUpRight aria-hidden="true" />
              </a>
            </li>
            <li>
              <a href={currentEvent.scheduleHref} download>
                <span className="index-list-n">B</span>
                <span className="index-list-label">
                  Official schedule <small>PDF · 70 KB</small>
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
                <span className="index-list-n">C</span>
                <span className="index-list-label">
                  Official event page{' '}
                  <small>corinthianvintageautoracing.com</small>
                </span>
                <ArrowUpRight aria-hidden="true" />
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
      <div className="console-body">
        <p className="console-label">
          <LiveDot tone="idle" /> Race weekend underway
        </p>
        <p className="console-title">Between sessions</p>
        <p className="console-text">
          Live standings appear automatically when the next group takes the
          green flag.
        </p>
        <button
          type="button"
          className="button button-primary"
          onClick={() => onNavigate('timing')}
        >
          <Roll>Open live timing</Roll>
          <ArrowRight aria-hidden="true" />
        </button>
      </div>
    );

  if (phase === 'after')
    return (
      <div className="console-body">
        <p className="console-label">Checkered flag</p>
        <p className="console-title">Weekend complete</p>
        <p className="console-text">
          Result sheets from all three days are ready to download.
        </p>
        <button
          type="button"
          className="button button-primary"
          onClick={() => onNavigate('results')}
        >
          <Roll>View results</Roll>
          <ArrowRight aria-hidden="true" />
        </button>
      </div>
    );

  const firstDay = eventSchedule[0];
  const driversMeeting = firstDay?.items.find((item) =>
    /drivers meeting/i.test(item.title),
  );
  const firstOnTrack = firstDay?.items.find(
    (item) => item.kind === 'track' && item.time,
  );

  return (
    <div className="console-body">
      <p className="console-label console-label-split">
        <span>Countdown to green</span>
        {firstDay && firstOnTrack && (
          <span>
            {firstDay.day.slice(0, 3)} {firstOnTrack.time}
          </span>
        )}
      </p>
      <GreenFlagCountdown />
      <div className="console-row">
        <p className="console-text">
          {driversMeeting?.time
            ? `Drivers meeting ${driversMeeting.time.replace(' ', '\u00a0')}\u00a0·\u00a0Pavilion`
            : 'First cars on track Friday morning'}
        </p>
        <button
          type="button"
          className="console-link"
          onClick={() => onNavigate('schedule')}
        >
          <CalendarDays aria-hidden="true" />
          <Roll>Schedule</Roll>
        </button>
      </div>
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
    <div className="console-body">
      <p className="console-label">Viewing a saved session</p>
      <p className="console-title">
        {formatSessionName(timing.snapshot.runName)}
      </p>
      <p className="console-text">
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
        <Roll>Back to live timing</Roll>
        <ArrowRight aria-hidden="true" />
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
    <div className="console-body">
      <div className="console-label console-label-split">
        <span className="console-live">
          <LiveDot tone={feedState === 'live' ? 'live' : 'stale'} />
          {feedState === 'live' ? 'On track now' : 'Feed delayed'}
        </span>
        <FlagPill flag={snapshot.flag} size="sm" />
      </div>
      <div className="console-session">
        <p className="console-title">{formatSessionName(snapshot.runName)}</p>
        <p className="console-clock">
          <strong>{clock.value}</strong>
          <span>{clock.label}</span>
        </p>
      </div>
      {topThree.length > 0 && (
        <ol className="tower" aria-label="Top three">
          {topThree.map((car) => (
            <li key={car.registrationKey || car.registrationNumber}>
              <span className="tower-pos" data-podium={car.position}>
                {car.position}
              </span>
              <CarNumber number={car.number} size="sm" />
              <span className="tower-driver">
                {car.driver || `Car ${car.number}`}
              </span>
              <span className="tower-time">
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
        className="button button-primary console-cta"
        onClick={() => onNavigate('timing')}
      >
        <Roll>Full standings</Roll>
        <ArrowRight aria-hidden="true" />
      </button>
    </div>
  );
}
