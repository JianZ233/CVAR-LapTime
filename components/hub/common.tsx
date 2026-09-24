import { ArrowDown, ArrowUp } from 'lucide-react';

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
      {detail && <span className="flag-pill-detail">{detail}</span>}
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
  tone?: 'live' | 'stale' | 'idle';
}) {
  return <span className={`live-dot live-dot-${tone}`} aria-hidden="true" />;
}

export function PageHeading({
  eyebrow,
  title,
  children,
  actions,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="page-heading">
      <div className="page-heading-copy">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {children && <div className="page-heading-lede">{children}</div>}
      </div>
      {actions && <div className="page-heading-actions">{actions}</div>}
    </header>
  );
}
