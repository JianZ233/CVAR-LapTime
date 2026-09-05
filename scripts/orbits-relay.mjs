import net from 'node:net';

import { createTimingState } from './rmonitor.mjs';

const host = process.env.ORBITS_HOST || '127.0.0.1';
const port = Number(process.env.ORBITS_PORT || 50000);
const ingestUrl = process.env.CVAR_INGEST_URL;
const ingestKey = process.env.CVAR_INGEST_KEY;
const state = createTimingState({
  eventName: process.env.CVAR_EVENT_NAME || 'CVAR Track Weekend',
  trackName: process.env.CVAR_TRACK_NAME || 'Eagles Canyon Raceway',
  trackLength: process.env.CVAR_TRACK_LENGTH || '2.7 mi · 16 turns',
  sessionMode: process.env.CVAR_SESSION_MODE || 'auto',
});

if (!ingestUrl || !ingestKey) {
  console.error('Set CVAR_INGEST_URL and CVAR_INGEST_KEY before starting the relay.');
  process.exit(1);
}

let reconnectDelay = 1_000;
let publishTimer;
let publishing = false;
let publishAgain = false;

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
      if (state.apply(line)) schedulePublish();
    }
  });

  socket.on('error', (error) => console.error(`Orbits connection error: ${error.message}`));
  socket.on('close', () => {
    console.log(`Orbits disconnected. Retrying in ${reconnectDelay / 1000}s.`);
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 15_000);
  });
}

function schedulePublish() {
  if (publishTimer) return;
  publishTimer = setTimeout(() => {
    publishTimer = undefined;
    void publish();
  }, 750);
}

async function publish() {
  if (publishing) {
    publishAgain = true;
    return;
  }
  publishing = true;
  try {
    const snapshot = state.snapshot();
    const response = await fetch(ingestUrl, {
      method: 'POST',
      headers: { authorization: `Bearer ${ingestKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(snapshot),
    });
    if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
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

connect();
