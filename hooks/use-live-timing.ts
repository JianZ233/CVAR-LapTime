'use client';

import { useEffect, useRef, useState } from 'react';

import { ARCHIVE_EVENT_ID, CURRENT_EVENT_ID } from '@/lib/events';
import {
  demoSnapshot,
  isTimingSnapshot,
  rankSnapshotForSession,
  type TimingSnapshot,
} from '@/lib/timing';
import type { FeedState, TimingSessionSummary } from '@/lib/timing-display';

export function useLiveTiming() {
  const [snapshot, setSnapshot] = useState<TimingSnapshot>(demoSnapshot);
  const [feedState, setFeedState] = useState<FeedState>('demo');
  const [clock, setClock] = useState(0);
  const [sessions, setSessions] = useState<TimingSessionSummary[]>([]);
  const [archiveSessions, setArchiveSessions] = useState<
    TimingSessionSummary[]
  >([]);
  const [archiveLoaded, setArchiveLoaded] = useState(false);
  const [liveSessionId, setLiveSessionId] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState('live');
  const hasReceivedData = useRef(false);
  const hasReceivedLiveData = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function refreshSessions() {
      try {
        const response = await fetch(`/api/sessions?event=${CURRENT_EVENT_ID}`);
        if (!response.ok) return;
        const body = (await response.json()) as {
          liveSessionId?: unknown;
          sessions?: unknown;
        };
        if (cancelled || !Array.isArray(body.sessions)) return;
        setSessions(
          (body.sessions as TimingSessionSummary[]).filter(
            (session) => session.carCount > 0,
          ),
        );
        if (typeof body.liveSessionId === 'string')
          setLiveSessionId(body.liveSessionId);
      } catch {
        // Live timing can continue even if the session menu refresh is delayed.
      }
    }
    void refreshSessions();
    const timer = window.setInterval(refreshSessions, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function refreshArchive() {
      try {
        const response = await fetch(`/api/sessions?event=${ARCHIVE_EVENT_ID}`);
        if (!response.ok) return;
        const body = (await response.json()) as { sessions?: unknown };
        if (cancelled || !Array.isArray(body.sessions)) return;
        setArchiveSessions(
          (body.sessions as TimingSessionSummary[]).filter(
            (session) => session.carCount > 0,
          ),
        );
      } catch {
        // The event page remains usable if archive storage is temporarily offline.
      } finally {
        if (!cancelled) setArchiveLoaded(true);
      }
    }
    void refreshArchive();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const endpoint =
          selectedSessionId === 'live'
            ? `/api/live?event=${CURRENT_EVENT_ID}`
            : `/api/sessions?event=${CURRENT_EVENT_ID}&session=${encodeURIComponent(selectedSessionId)}`;
        const response = await fetch(endpoint);
        if (!response.ok)
          throw new Error(`Timing endpoint returned ${response.status}`);
        const body = (await response.json()) as { snapshot?: unknown };
        if (!isTimingSnapshot(body.snapshot))
          throw new Error('Invalid timing snapshot');
        if (cancelled) return;
        hasReceivedData.current = true;
        if (selectedSessionId === 'live') hasReceivedLiveData.current = true;
        setSnapshot(rankSnapshotForSession(body.snapshot));
        setFeedState(
          selectedSessionId === 'live'
            ? Date.now() - new Date(body.snapshot.updatedAt).getTime() > 15_000
              ? 'stale'
              : 'live'
            : 'history',
        );
      } catch {
        if (cancelled) return;
        // Returning to "live" before any live data exists goes back to the
        // pre-race standby instead of showing a saved session as delayed.
        if (selectedSessionId === 'live' && !hasReceivedLiveData.current)
          setFeedState('demo');
        else if (hasReceivedData.current) setFeedState('stale');
      }
    }
    void refresh();
    const poller =
      selectedSessionId === 'live'
        ? window.setInterval(refresh, 2_000)
        : undefined;
    const ticker = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => {
      cancelled = true;
      if (poller) window.clearInterval(poller);
      window.clearInterval(ticker);
    };
  }, [selectedSessionId]);

  const timestamp = new Date(snapshot.updatedAt).getTime();
  const secondsAgo = Number.isFinite(timestamp)
    ? Math.max(0, Math.floor((clock - timestamp) / 1_000))
    : 0;
  return {
    snapshot,
    feedState:
      feedState === 'live' && secondsAgo > 15 ? ('stale' as const) : feedState,
    secondsAgo,
    sessions,
    archiveSessions,
    archiveLoaded,
    liveSessionId,
    selectedSessionId,
    selectSession: setSelectedSessionId,
  };
}

export type LiveTiming = ReturnType<typeof useLiveTiming>;

/**
 * Current time, updated on an interval. Returns null during the static
 * prerender and first hydration pass so time-based text never mismatches.
 */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, intervalMs);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [intervalMs]);
  return now;
}
