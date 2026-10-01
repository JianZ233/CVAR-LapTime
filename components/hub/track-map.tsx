import { useState } from 'react';

import { usePrefersReducedMotion } from '@/components/hub/common';
import { hallettTrack } from '@/lib/hallett-track';

// One stylised lap. Real vintage laps at Hallett run about a minute and a
// half; this is quick enough to read as motion without demanding attention.
const LAP_SECONDS = 14;

/**
 * Before and between sessions a stylised car laps the circuit. While a
 * session is live that decoration would read as a real position, which one
 * start / finish loop cannot know, so instead the line pulses each time a
 * car is timed across it.
 */
export function TrackMap({
  live = false,
  crossings = 0,
}: {
  live?: boolean;
  /** Total timed laps in the live session; each change is a crossing. */
  crossings?: number;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const [activeTurn, setActiveTurn] = useState<number | null>(null);
  const { startFinish } = hallettTrack;

  return (
    <figure className="track-map">
      <div className="track-map-canvas">
        <svg
          viewBox={hallettTrack.viewBox}
          // role="img" with a <title> is the accessible pattern for inline
          // SVG; there is no HTML element to use instead.
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
          role="img"
          aria-labelledby="track-map-title"
          className="track-map-svg"
        >
          <title id="track-map-title">
            Map of Hallett Motor Racing Circuit with its ten numbered turns
          </title>
          <defs>
            <pattern
              id="checker"
              width="8"
              height="8"
              patternUnits="userSpaceOnUse"
            >
              <rect width="8" height="8" fill="#fff" />
              <rect width="4" height="4" fill="#0b0d0e" />
              <rect x="4" y="4" width="4" height="4" fill="#0b0d0e" />
            </pattern>
          </defs>
          <path
            d={hallettTrack.pitLane}
            className="track-pit"
            fill="none"
            pathLength={1}
          />
          <path d={hallettTrack.path} className="track-edge" fill="none" />
          <path
            id="hallett-lap"
            d={hallettTrack.path}
            className="track-surface"
            fill="none"
            pathLength={1000}
          />
          <path
            d={hallettTrack.path}
            className="track-draw"
            fill="none"
            pathLength={1000}
          />
          <g
            transform={`translate(${startFinish.x} ${startFinish.y}) rotate(${startFinish.angle + 90})`}
          >
            <rect
              x="-22"
              y="-5"
              width="44"
              height="10"
              fill="url(#checker)"
              className="track-sf"
            />
            {live && crossings > 0 && (
              <rect
                key={crossings}
                x="-22"
                y="-5"
                width="44"
                height="10"
                className="track-sf-pulse"
              />
            )}
          </g>
          {!reducedMotion && !live && (
            <>
              <path
                d={hallettTrack.path}
                className="track-trail"
                fill="none"
                pathLength={1000}
                strokeDasharray="70 930"
              >
                <animate
                  attributeName="stroke-dashoffset"
                  from="70"
                  to="-930"
                  dur={`${LAP_SECONDS}s`}
                  repeatCount="indefinite"
                />
              </path>
              <g className="track-car">
                <circle r="13" className="track-car-halo" />
                <circle r="7.5" className="track-car-dot" />
                <animateMotion
                  dur={`${LAP_SECONDS}s`}
                  repeatCount="indefinite"
                  rotate="auto"
                >
                  <mpath href="#hallett-lap" />
                </animateMotion>
              </g>
            </>
          )}
          {hallettTrack.turns.map((turn) => (
            <g key={turn.n} transform={`translate(${turn.x} ${turn.y})`}>
              <g
                className="track-turn"
                data-active={activeTurn === turn.n || undefined}
                onPointerEnter={() => setActiveTurn(turn.n)}
                onPointerLeave={() => setActiveTurn(null)}
              >
                <circle r="22" />
                <text dy="0.36em" textAnchor="middle">
                  {turn.n}
                </text>
              </g>
            </g>
          ))}
        </svg>
        <p className="track-map-legend" aria-hidden="true">
          <span className="track-map-legend-sf" />
          {live
            ? 'Start / finish · pulses on every timed lap'
            : 'Start / finish'}
          <span className="track-map-legend-pit" /> Pit lane
        </p>
      </div>
      <figcaption className="track-turns">
        <span className="track-turns-label">Turn by turn</span>
        <ol>
          {hallettTrack.turns.map((turn) => (
            <li
              key={turn.n}
              data-active={activeTurn === turn.n || undefined}
              onPointerEnter={() => setActiveTurn(turn.n)}
              onPointerLeave={() => setActiveTurn(null)}
            >
              <span className="track-turns-n">
                {String(turn.n).padStart(2, '0')}
              </span>
              <span className="track-turns-name">{turn.name}</span>
            </li>
          ))}
        </ol>
        <span className="track-turns-credit">
          Map data © OpenStreetMap contributors
        </span>
      </figcaption>
    </figure>
  );
}
