import { useState } from 'react';
import { Download, Info, PartyPopper, Users, Utensils } from 'lucide-react';

import { Kicker, PageHeading, Roll } from '@/components/hub/common';
import { currentEvent } from '@/lib/events';
import { eventSchedule, type ScheduleItem } from '@/lib/schedule';
import { eventDayIndex } from '@/lib/timing-display';

const isNote = (item: ScheduleItem) =>
  Boolean(item.note && !item.time && !item.duration);

// Operations notes apply to the whole weekend, so they sit under the days.
const notes = eventSchedule.flatMap((day) => day.items.filter(isNote));

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
        eyebrow={<Kicker>{`${currentEvent.dates} · Hallett`}</Kicker>}
        title="Schedule"
        accent="three days, run by run"
        actions={
          <a
            href={currentEvent.scheduleHref}
            download
            className="button button-outline"
          >
            <Download aria-hidden="true" className="icon-drop" />
            <Roll>Official schedule (PDF)</Roll>
          </a>
        }
      >
        Times and run order from the official CVAR schedule. Only published
        clock times are shown; later sessions follow in order. Everything is
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
        {eventSchedule.map((day, index) => {
          const [month, date] = day.date.split(' ');
          return (
            <section
              key={day.day}
              className="schedule-day"
              data-active={index === activeDay}
              data-today={index === todayIndex || undefined}
              aria-labelledby={`schedule-${day.day}`}
            >
              <header className="schedule-day-head">
                <span className="schedule-day-num" aria-hidden="true">
                  {date?.padStart(2, '0')}
                </span>
                <span className="schedule-day-name">
                  <h2 id={`schedule-${day.day}`}>{day.day}</h2>
                  <span>
                    {month} {date}
                    {index === todayIndex && (
                      <span className="today-tag">Today</span>
                    )}
                  </span>
                </span>
              </header>
              <ol className="timeline">
                {day.items
                  .filter((item) => !isNote(item))
                  .map((item, itemIndex, items) => (
                    <ScheduleRow
                      key={`${day.day}-${item.title}-${itemIndex}`}
                      item={item}
                      previousGroups={previousRunOrder(items, itemIndex)}
                    />
                  ))}
              </ol>
            </section>
          );
        })}
      </div>

      {notes.map((note) => (
        <aside key={note.title} className="ops-note">
          <Info aria-hidden="true" />
          <p>
            <strong>{note.title}</strong>
            {note.note}
          </p>
        </aside>
      ))}
    </div>
  );
}

/** The run order last shown above this item on the same day. */
function previousRunOrder(items: ScheduleItem[], index: number) {
  for (let i = index - 1; i >= 0; i--) {
    const groups = items[i]?.groups;
    if (groups) return groups;
  }
  return undefined;
}

function ScheduleRow({
  item,
  previousGroups,
}: {
  item: ScheduleItem;
  previousGroups?: string[];
}) {
  const kind = item.kind || 'track';
  const Icon =
    kind === 'meeting'
      ? Users
      : kind === 'break'
        ? Utensils
        : kind === 'social'
          ? PartyPopper
          : null;
  const feature = /feature/i.test(item.title);
  const sameOrder =
    item.groups &&
    previousGroups &&
    item.groups.join('|') === previousGroups.join('|');

  return (
    <li className={`tl-item tl-${kind}`} data-feature={feature || undefined}>
      <span className="tl-time" data-untimed={!item.time || undefined}>
        {item.time || 'then'}
      </span>
      <div className="tl-body">
        <p className="tl-title">
          {Icon && <Icon aria-hidden="true" />}
          {item.title}
        </p>
        {item.duration && (
          <p className="tl-duration">
            {feature && <span className="tl-tag">Feature</span>}
            {item.duration}
            {sameOrder && <span> · same run order</span>}
          </p>
        )}
        {item.groups && !sameOrder && <RunOrder groups={item.groups} />}
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
