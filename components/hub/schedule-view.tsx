import { useState } from 'react';
import { Download, Info, PartyPopper, Users, Utensils } from 'lucide-react';

import { PageHeading } from '@/components/hub/common';
import { currentEvent } from '@/lib/events';
import { eventSchedule, type ScheduleItem } from '@/lib/schedule';
import { eventDayIndex } from '@/lib/timing-display';

export function ScheduleView({
  now,
  initialDay,
}: {
  now: number | null;
  initialDay?: number;
}) {
  const todayIndex = now === null ? -1 : eventDayIndex(now);
  const [pickedDay, setPickedDay] = useState<number | undefined>(initialDay);
  const activeDay = pickedDay ?? (todayIndex >= 0 ? todayIndex : 0);

  return (
    <div className="wrap page">
      <PageHeading
        eyebrow={`${currentEvent.dates} · Hallett`}
        title="Schedule"
        actions={
          <a
            href={currentEvent.scheduleHref}
            download
            className="button button-secondary"
          >
            <Download aria-hidden="true" /> Official schedule (PDF)
          </a>
        }
      >
        Times and run order from the official CVAR schedule. Everything is
        subject to change at the track.
      </PageHeading>

      <fieldset className="segmented day-switch">
        <legend className="sr-only">Race day</legend>
        {eventSchedule.map((day, index) => (
          <button
            key={day.day}
            type="button"
            aria-pressed={index === activeDay}
            onClick={() => setPickedDay(index)}
          >
            <strong>{day.day.slice(0, 3)}</strong>
            <span>{day.date.replace('October', 'Oct')}</span>
            {index === todayIndex && (
              <span className="today-dot">
                <span className="sr-only">Today</span>
              </span>
            )}
          </button>
        ))}
      </fieldset>

      <div className="schedule-grid">
        {eventSchedule.map((day, index) => (
          <section
            key={day.day}
            className="schedule-day"
            data-active={index === activeDay}
            aria-labelledby={`schedule-${day.day}`}
          >
            <header className="schedule-day-head">
              <h2 id={`schedule-${day.day}`}>{day.day}</h2>
              <span>
                {day.date}
                {index === todayIndex && (
                  <span className="today-tag">Today</span>
                )}
              </span>
            </header>
            <ol className="timeline">
              {day.items.map((item, itemIndex) => (
                <ScheduleRow
                  key={`${day.day}-${item.title}-${itemIndex}`}
                  item={item}
                />
              ))}
            </ol>
          </section>
        ))}
      </div>

      <p className="footnote">
        Only clock times published on the official schedule are shown. Later
        sessions follow the listed run order.
      </p>
    </div>
  );
}

function ScheduleRow({ item }: { item: ScheduleItem }) {
  const kind =
    item.note && !item.time && !item.duration ? 'note' : item.kind || 'track';
  const Icon =
    kind === 'meeting'
      ? Users
      : kind === 'break'
        ? Utensils
        : kind === 'social'
          ? PartyPopper
          : kind === 'note'
            ? Info
            : null;

  return (
    <li className={`tl-item tl-${kind}`}>
      <span className="tl-time">{item.time}</span>
      <div className="tl-body">
        <p className="tl-title">
          {Icon && <Icon aria-hidden="true" />}
          {item.title}
          {/feature/i.test(item.title) && (
            <span className="tl-tag">Feature</span>
          )}
        </p>
        {item.duration && <p className="tl-duration">{item.duration}</p>}
        {item.groups && <RunOrder groups={item.groups} />}
        {item.note && <p className="tl-note">{item.note}</p>}
      </div>
    </li>
  );
}

function RunOrder({ groups }: { groups: string[] }) {
  const numbered = groups.every((group) => /^Groups?\s/.test(group));
  return (
    <div className="run-order">
      <span className="run-order-label">
        Run order{numbered ? ' · Groups' : ''}
      </span>
      <ol>
        {groups.map((group, index) => (
          <li key={`${group}-${index}`}>
            {numbered ? group.replace(/^Groups?\s/, '') : group}
          </li>
        ))}
      </ol>
    </div>
  );
}
