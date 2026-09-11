import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const label = 'com.cvar.orbits-relay';
const action = process.argv[2] || 'status';
const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const environmentPath = path.join(projectDirectory, '.env.live');
const relayPath = path.join(projectDirectory, 'scripts', 'orbits-relay.mjs');
const launchAgentsDirectory = path.join(os.homedir(), 'Library', 'LaunchAgents');
const logDirectory = path.join(os.homedir(), 'Library', 'Logs', 'CVAR');
const serviceDirectory = path.join(os.homedir(), 'Library', 'Application Support', 'CVAR-LapTime');
const serviceEnvironmentPath = path.join(serviceDirectory, '.env.live');
const serviceRelayPath = path.join(serviceDirectory, 'orbits-relay.mjs');
const serviceParserPath = path.join(serviceDirectory, 'rmonitor.mjs');
const plistPath = path.join(launchAgentsDirectory, `${label}.plist`);
const serviceTarget = `gui/${process.getuid()}/${label}`;
const domainTarget = `gui/${process.getuid()}`;

if (process.platform !== 'darwin') fail('The relay service installer is only for macOS.');

if (action === 'install') {
  install();
} else if (action === 'status') {
  const result = launchctl(['print', serviceTarget], true);
  process.exit(result.status ?? 1);
} else if (action === 'uninstall') {
  launchctl(['bootout', serviceTarget], false);
  console.log('CVAR Orbits relay service stopped.');
} else {
  fail('Usage: node scripts/relay-service.mjs install|status|uninstall');
}

function install() {
  if (!existsSync(environmentPath)) fail(`Missing ${environmentPath}`);
  if (!existsSync(relayPath)) fail(`Missing ${relayPath}`);

  const environment = readFileSync(environmentPath, 'utf8');
  for (const key of ['ORBITS_HOST', 'ORBITS_PORT', 'CVAR_INGEST_URL', 'CVAR_INGEST_KEY']) {
    if (!new RegExp(`^${key}=.+$`, 'm').test(environment)) fail(`Missing ${key} in ${environmentPath}`);
  }

  mkdirSync(launchAgentsDirectory, { recursive: true });
  mkdirSync(logDirectory, { recursive: true });
  mkdirSync(serviceDirectory, { recursive: true });
  copyFileSync(environmentPath, serviceEnvironmentPath);
  copyFileSync(relayPath, serviceRelayPath);
  copyFileSync(path.join(projectDirectory, 'scripts', 'rmonitor.mjs'), serviceParserPath);
  chmodSync(serviceEnvironmentPath, 0o600);
  const standardOutputPath = path.join(logDirectory, 'orbits-relay.log');
  const standardErrorPath = path.join(logDirectory, 'orbits-relay-error.log');
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xml(label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(process.execPath)}</string>
    <string>--env-file=${xml(serviceEnvironmentPath)}</string>
    <string>${xml(serviceRelayPath)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${xml(serviceDirectory)}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>5</integer>
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
  <string>${xml(standardOutputPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(standardErrorPath)}</string>
</dict>
</plist>
`;

  writeFileSync(plistPath, plist, { mode: 0o600 });
  chmodSync(plistPath, 0o600);
  launchctl(['bootout', serviceTarget], false);
  checkedLaunchctl(['bootstrap', domainTarget, plistPath]);
  checkedLaunchctl(['enable', serviceTarget]);
  checkedLaunchctl(['kickstart', '-k', serviceTarget]);
  console.log(`CVAR Orbits relay service installed and started: ${serviceTarget}`);
  console.log(`Log: ${standardOutputPath}`);
}

function checkedLaunchctl(arguments_) {
  const result = launchctl(arguments_, true);
  if (result.status !== 0) fail(`launchctl ${arguments_.join(' ')} failed.`);
}

function launchctl(arguments_, showOutput) {
  return spawnSync('/bin/launchctl', arguments_, {
    encoding: 'utf8',
    stdio: showOutput ? 'inherit' : 'ignore',
  });
}

function xml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
