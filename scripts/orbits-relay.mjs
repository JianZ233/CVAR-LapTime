import net from 'node:net';

import { createTimingState } from './rmonitor.mjs';

const host = process.env.ORBITS_HOST || '127.0.0.1';
const port = Number(process.env.ORBITS_PORT || 50000);
const ingestUrl = process.env.CVAR_INGEST_URL;
const ingestKey = process.env.CVAR_INGEST_KEY;
const eventId = process.env.CVAR_EVENT_ID || 'canyon-classic-2026';
const minimumPublishInterval = Math.max(1_000, Number(process.env.CVAR_PUBLISH_INTERVAL_MS || 10_000));
const state = createTimingState({
  eventName: process.env.CVAR_EVENT_NAME || 'Canyon Classic at ECR',
  trackName: process.env.CVAR_TRACK_NAME || 'Eagles Canyon Raceway',
  trackLength: process.env.CVAR_TRACK_LENGTH || '2.7 mi · 15 turns',
  sessionMode: process.env.CVAR_SESSION_MODE || 'auto',
});

if (!ingestUrl || !ingestKey) {
  console.error('Set CVAR_INGEST_URL and CVAR_INGEST_KEY before starting the relay.');
  process.exit(1);
}

let reconnectDelay = 1_000;
let publishTimer;
let publishDueAt = 0;
let publishing = false;
let publishAgain = false;
let lastPublishedAt = 0;
let lastPublishedSessionId = '';
let lastRegistrationFingerprint = '';
const sessionStartedAt = new Map();
const pendingPassings = [];

function connect() {
  console.log(`Connecting to Orbits RMonitor feed at ${host}:${port}...`);
  const socket = net.createConnection({ host, port });
  socket.setEncoding('utf8');
  socket.setKeepAlive(true, 5_000);
  let buffer = '';

  socket.on('connect', () => {
    reconnectDelay = 1_000;
    console.log('Connected to Orbits. Waiting for timing records.');
  });

  socket.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      if (process.env.RMONITOR_LOG === '1') console.log(line);
      if (!state.apply(line)) continue;
      const passings = state.drainPassings();
      if (passings.length) pendingPassings.push(...passings);
      schedulePublish(passings.length > 0);
    }
  });

  socket.on('error', (error) => console.error(`Orbits connection error: ${error.message}`));
  socket.on('close', () => {
    console.log(`Orbits disconnected. Retrying in ${reconnectDelay / 1000}s.`);
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 15_000);
  });
}

function schedulePublish(urgent = false) {
  const regularDelay = Math.max(750, minimumPublishInterval - (Date.now() - lastPublishedAt));
  const delay = urgent ? 250 : regularDelay;
  const dueAt = Date.now() + delay;
  if (publishTimer && publishDueAt <= dueAt) return;
  if (publishTimer) clearTimeout(publishTimer);
  publishDueAt = dueAt;
  publishTimer = setTimeout(() => {
    publishTimer = undefined;
    publishDueAt = 0;
    void publish();
  }, delay);
}

async function publish() {
  if (publishing) {
    publishAgain = true;
    return;
  }
  publishing = true;
  try {
    const snapshot = state.snapshot();
    const sessionId = createSessionId(snapshot.runName);
    const startedAt = sessionStartedAt.get(sessionId) || snapshot.updatedAt;
    sessionStartedAt.set(sessionId, startedAt);
    const registrationList = state.registrations();
    const registrationFingerprint = JSON.stringify(registrationList);
    const passings = pendingPassings.slice();
    const response = await fetch(ingestUrl, {
      method: 'POST',
      headers: { authorization: `Bearer ${ingestKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        eventId,
        sessionId,
        sessionStartedAt: startedAt,
        sessionChanged: sessionId !== lastPublishedSessionId,
        snapshot,
        passings,
        registrations: registrationFingerprint !== lastRegistrationFingerprint ? registrationList : [],
      }),
    });
    if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
    pendingPassings.splice(0, passings.length);
    lastPublishedAt = Date.now();
    lastPublishedSessionId = sessionId;
    lastRegistrationFingerprint = registrationFingerprint;
    console.log(`Published ${snapshot.cars.length} cars · ${snapshot.runName} · ${snapshot.flag}`);
  } catch (error) {
    console.error(`Publish failed: ${error.message}`);
  } finally {
    publishing = false;
    if (publishAgain) {
      publishAgain = false;
      schedulePublish();
    }
  }
}

async function checkCloud() {
  const url = new URL(ingestUrl);
  url.searchParams.set('check', '1');
  const response = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${ingestKey}` } });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  console.log('Vercel ingest and Redis are ready.');
}

function createSessionId(runName) {
  const day = new Date().toISOString().slice(0, 10);
  const slug = runName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'session';
  return `${day}-${slug}`;
}

void checkCloud().catch((error) => console.error(`Cloud preflight failed: ${error.message}`)).finally(connect);
