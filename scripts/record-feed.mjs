import { createWriteStream, mkdirSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const host = process.env.ORBITS_HOST || '127.0.0.1';
const port = Number(process.env.ORBITS_PORT || 50000);
const recordingPath = process.env.RMONITOR_RECORDING || path.join('recordings', `rmonitor-${fileTimestamp()}.log`);

mkdirSync(path.dirname(recordingPath), { recursive: true });
const output = createWriteStream(recordingPath, { flags: 'a' });
let reconnectDelay = 1_000;
let stopping = false;
let activeSocket;

console.log(`Recording the raw RMonitor feed to ${path.resolve(recordingPath)}`);
console.log('The recording can contain driver names and transponder identifiers. Keep it private.');
connect();

function connect() {
  if (stopping) return;
  console.log(`Connecting to Orbits at ${host}:${port}...`);
  const socket = net.createConnection({ host, port });
  activeSocket = socket;
  socket.setKeepAlive(true, 5_000);

  socket.on('connect', () => {
    reconnectDelay = 1_000;
    console.log('Connected. Press Ctrl+C when the sample session is complete.');
  });
  socket.on('data', (chunk) => output.write(chunk));
  socket.on('error', (error) => console.error(`Orbits connection error: ${error.message}`));
  socket.on('close', () => {
    if (activeSocket === socket) activeSocket = undefined;
    if (stopping) return;
    console.log(`Orbits disconnected. Retrying in ${reconnectDelay / 1000}s.`);
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 15_000);
  });
}

function stop(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`\n${signal} received. Closing ${path.resolve(recordingPath)}.`);
  activeSocket?.destroy();
  output.end(() => process.exit(0));
}

process.once('SIGINT', () => stop('SIGINT'));
process.once('SIGTERM', () => stop('SIGTERM'));

function fileTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}
