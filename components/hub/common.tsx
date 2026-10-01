import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';

import { useNow } from '@/hooks/use-live-timing';
import { currentEvent } from '@/lib/events';
import { flagLabel, flagTone } from '@/lib/timing-display';

export type HubView = 'event' | 'timing' | 'schedule' | 'results';
export type HubNavigate = (view: HubView, options?: { day?: number }) => void;

export function FlagPill({
  flag,
  detail,
  size = 'md',
}: {
  flag: string;
  detail?: string;
  size?: 'sm' | 'md';
}) {
  const tone = flagTone(flag);
  return (
    <span className={`flag-pill flag-pill-${size}`} data-flag={tone}>
      <span className="flag-swatch" aria-hidden="true" />
      <span className="flag-pill-label">{flagLabel(flag)}</span>
      {detail && (
        <span className="flag-pill-detail" title="Time under this flag">
          {detail}
          <span className="sr-only"> under this flag</span>
        </span>
      )}
    </span>
  );
}

/** Vintage-style number roundel ("meatball"); widens for long numbers. */
export function CarNumber({
  number,
  size = 'md',
}: {
  number: string;
  size?: 'sm' | 'md';
}) {
  return (
    <span
      className={`car-number car-number-${size}`}
      data-long={number.length > 2 || undefined}
    >
      {number || '—'}
    </span>
  );
}

export function PositionMovement({ change }: { change: number }) {
  if (!change) return null;
  const gained = change > 0;
  const amount = Math.abs(change);
  const label = `${gained ? 'Gained' : 'Lost'} ${amount} ${amount === 1 ? 'position' : 'positions'} since the last lap`;
  return (
    <span
      className={`movement ${gained ? 'movement-up' : 'movement-down'}`}
      aria-label={label}
      title={label}
    >
      {gained ? (
        <ArrowUp aria-hidden="true" />
      ) : (
        <ArrowDown aria-hidden="true" />
      )}
      {amount}
    </span>
  );
}

export function PositionBadge({ position }: { position: number }) {
  const podium = position >= 1 && position <= 3 ? position : undefined;
  return (
    <span className="position-badge" data-podium={podium}>
      {position || '—'}
    </span>
  );
}

export function LiveDot({
  tone = 'live',
}: {
  tone?: 'live' | 'stale' | 'idle' | 'soon';
}) {
  return <span className={`live-dot live-dot-${tone}`} aria-hidden="true" />;
}

/** Numbered section label: "01 — The circuit". */
export function Kicker({
  index,
  children,
  tone,
}: {
  index?: string;
  children: React.ReactNode;
  tone?: 'light';
}) {
  return (
    <p className="kicker" data-tone={tone}>
      {index && <span className="kicker-index">{index}</span>}
      <span>{children}</span>
    </p>
  );
}

/**
 * Hover label that rolls up to a second copy of itself. The copy is hidden
 * from assistive technology so the label is only announced once.
 */
export function Roll({ children }: { children: string }) {
  return (
    <span className="roll">
      <span>{children}</span>
      <span aria-hidden="true">{children}</span>
    </span>
  );
}

export function PageHeading({
  eyebrow,
  title,
  accent,
  children,
  actions,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  /** Serif italic phrase set after the title. */
  accent?: React.ReactNode;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="page-heading">
      {eyebrow && <div className="page-heading-eyebrow">{eyebrow}</div>}
      <h1 className="page-heading-title">
        <span className="mask-line">
          <span>{title}</span>
        </span>
        {accent && <em className="page-heading-accent">{accent}</em>}
      </h1>
      {(children || actions) && (
        <div className="page-heading-foot">
          {children && <div className="page-heading-lede">{children}</div>}
          {actions && <div className="page-heading-actions">{actions}</div>}
        </div>
      )}
    </header>
  );
}

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  return reduced;
}

/**
 * One split-flap tile. When the character changes, the old top half folds
 * down over the new one, like a timing-tower board.
 */
function Flap({ char }: { char: string }) {
  const previous = useRef(char);
  const [flip, setFlip] = useState<{ from: string; to: string; id: number }>();

  // Layout effect so the fold starts before the new character is painted.
  useLayoutEffect(() => {
    if (previous.current === char) return;
    setFlip((current) => ({
      from: previous.current,
      to: char,
      id: (current?.id || 0) + 1,
    }));
    previous.current = char;
  }, [char]);

  const from = flip?.from ?? char;
  return (
    <span className="flap">
      <span className="flap-half flap-top">
        <span>{char}</span>
      </span>
      <span className="flap-half flap-bottom">
        <span>{flip ? from : char}</span>
      </span>
      {flip && (
        <span key={flip.id} className="flap-fold">
          <span className="flap-half flap-fold-top">
            <span>{from}</span>
          </span>
          <span
            className="flap-half flap-fold-bottom"
            onAnimationEnd={() => setFlip(undefined)}
          >
            <span>{char}</span>
          </span>
        </span>
      )}
    </span>
  );
}

function countdownParts(msLeft: number | null) {
  if (msLeft === null)
    return { days: '--', hours: '--', minutes: '--', seconds: '--' };
  const total = Math.max(0, Math.floor(msLeft / 1_000));
  const pad = (value: number) => String(value).padStart(2, '0');
  return {
    days: pad(Math.floor(total / 86_400)),
    hours: pad(Math.floor((total % 86_400) / 3_600)),
    minutes: pad(Math.floor((total % 3_600) / 60)),
    seconds: pad(total % 60),
  };
}

/** Split-flap countdown to the first green flag of the weekend. */
export function GreenFlagCountdown() {
  const now = useNow(1_000);
  const left =
    now === null ? null : new Date(currentEvent.startsAt).getTime() - now;
  const parts = countdownParts(left);
  return (
    <>
      <p className="sr-only">
        {left === null
          ? `Green flag ${currentEvent.dates}`
          : `${Number(parts.days)} days and ${Number(parts.hours)} hours until the green flag`}
      </p>
      <SplitFlap
        groups={[
          { value: parts.days, label: 'Days' },
          { value: parts.hours, label: 'Hrs' },
          { value: parts.minutes, label: 'Min' },
          { value: parts.seconds, label: 'Sec' },
        ]}
      />
    </>
  );
}

export function SplitFlap({
  groups,
}: {
  groups: Array<{ value: string; label: string }>;
}) {
  return (
    <span className="split-flap" aria-hidden="true">
      {groups.map((group) => (
        <span key={group.label} className="split-flap-group">
          <span className="split-flap-digits">
            {group.value.split('').map((char, index) => (
              <Flap key={index} char={char} />
            ))}
          </span>
          <span className="split-flap-label">{group.label}</span>
        </span>
      ))}
    </span>
  );
}

/** Decorative ticker band; the same information is on the schedule. */
export function Marquee({ items }: { items: string[] }) {
  const row = (copy: number) => (
    <span className="marquee-row" key={copy}>
      {items.map((item, index) => (
        <span key={`${copy}-${index}`} className="marquee-item">
          {item}
          <span className="marquee-sep" />
        </span>
      ))}
    </span>
  );
  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee-track">{[0, 1].map(row)}</div>
    </div>
  );
}
