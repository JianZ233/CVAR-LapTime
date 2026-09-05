import net from 'node:net';

const minimumNodeMajor = 22;
const host = process.env.ORBITS_HOST || '127.0.0.1';
const port = Number(process.env.ORBITS_PORT || 50000);
const ingestUrl = process.env.CVAR_INGEST_URL;
const ingestKey = process.env.CVAR_INGEST_KEY;

let failed = false;

if (Number(process.versions.node.split('.')[0]) < minimumNodeMajor) {
  fail(`Node ${process.versions.node} is too old. Install Node 22.13 or newer.`);
} else {
  pass(`Node ${process.versions.node}`);
}

if (!ingestUrl || !ingestKey) {
  fail('Set CVAR_INGEST_URL and CVAR_INGEST_KEY before running preflight.');
} else {
  await checkCloud();
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  fail(`ORBITS_PORT must be a TCP port from 1 to 65535; received ${process.env.ORBITS_PORT}.`);
} else {
  await checkOrbits();
}

if (failed) {
  console.error('\nPreflight failed. Fix the items above and run npm run preflight again.');
  process.exitCode = 1;
} else {
  console.log('\nPreflight passed. The relay computer can reach both Orbits and the live website.');
}

async function checkCloud() {
  try {
    const url = new URL(ingestUrl);
    url.searchParams.set('check', '1');
    const response = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${ingestKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
    pass('Vercel ingest and Redis storage');
  } catch (error) {
    fail(`Cloud connection: ${error.message}`);
  }
}

function checkOrbits() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let finished = false;

    const finish = (error) => {
      if (finished) return;
      finished = true;
      socket.destroy();
      if (error) {
        fail(`Orbits feed at ${host}:${port}: ${error.message}. Enable the feed and check Windows Firewall.`);
      } else {
        pass(`Orbits RMonitor TCP feed at ${host}:${port}`);
      }
      resolve();
    };

    socket.setTimeout(5_000);
    socket.once('connect', () => finish());
    socket.once('timeout', () => finish(new Error('connection timed out')));
    socket.once('error', finish);
  });
}

function pass(message) {
  console.log(`PASS  ${message}`);
}

function fail(message) {
  failed = true;
  console.error(`FAIL  ${message}`);
}
