# CVAR Live Timing

A mobile-friendly live timing board for the Corinthian Vintage Auto Racing **Canyon Classic at ECR, September 11–13, 2026**. It shows session status, overall and class standings, laps, last lap, best lap, gap to the leader, and the full three-day event schedule.

The site starts in demo mode. Live timing appears automatically when the control-room relay is connected.

## How the data gets online

```text
X2 transponders + start/finish loop
              |
         X2 decoder/server
              |
          Orbits 5 (Windows)
              |
       local RMonitor TCP feed
        usually :50000 or :60000
              |
       scripts/orbits-relay.mjs
              | HTTPS, authenticated
              v
    Vercel /api/ingest -> Upstash Redis
              |
              v
       Vercel /api/live -> timing board
```

Vercel cannot open a TCP connection into the private network in the control room. That is why the small outbound relay is required. It reads the local Orbits feed and posts timing data to Vercel.

Redis keeps the current public board plus a durable archive of each session's latest classification, every unique lap passing, and registration/transponder assignments. Repeated heartbeat screens are not archived as duplicate race data. Archived data has no automatic expiration and is available only through the authenticated `/api/archive` endpoint. See [Timing data storage](docs/DATA-STORAGE.md) for the record layout and export route.

The RMonitor feed includes competitor (`$A`/`$COMP`), class (`$C`), race order (`$G`), practice/qualifying order (`$H`), passing (`$J`), and heartbeat/flag (`$F`) records. The relay parses those records and does not need direct access to the X2 decoder.

## Deploy the website to Vercel

1. Import `JianZ233/CVAR-LapTime` in Vercel.
2. In Vercel Marketplace, add an **Upstash Redis** database to the project. Vercel supplies `KV_REST_API_URL` and `KV_REST_API_TOKEN`. A database connected with the `CVAR_REDIS` prefix supplies `CVAR_REDIS_KV_REST_API_URL` and `CVAR_REDIS_KV_REST_API_TOKEN`; the app supports both forms.
3. Add a Vercel environment variable named `CVAR_INGEST_SECRET`. Use a long random value, for example the output of `openssl rand -hex 32`.
4. Deploy. The included `vercel.json` builds the static timing board from `dist/client`, and Vercel creates the functions in `api/`.
5. Open `https://YOUR-PROJECT.vercel.app/api/live`. Before the relay is started, a `404` response is expected.

Vercel should use Node.js 24.x (or 22.x). This project requires Node 22.13 or newer.

## Connect Orbits in the control room

Use the computer running Orbits, or another Windows computer on the same local network.

### Option A: Scoreboard Feed

1. In Orbits, open **Distribution** and then **Scoreboard Settings**.
2. Select the RMonitor protocol, enable the feed, and note the listed IP address and TCP port. Port `50000` is the usual default.
3. If the relay runs on the Orbits computer, use `ORBITS_HOST=127.0.0.1`. Otherwise use the Orbits computer's LAN IP address.

### Option B: Orbits 5 Local App Feed

1. In **Distribution**, select **Start local App Feed**.
2. Open **Local App Feed**, enable it, and note its address and port. Port `60000` is commonly used.
3. Keep the Local App Feed window open for the entire session.

MYLAPS documentation says the RMonitor feed is available over TCP/IP and that port 50000 is normally available. Confirm that the feature is included and enabled on CVAR's Orbits license before event day.

## Run the relay

Install [Node.js 22 LTS or newer](https://nodejs.org/) on the control-room computer and clone this repository. In PowerShell:

```powershell
$env:ORBITS_HOST="127.0.0.1"
$env:ORBITS_PORT="50000"
$env:CVAR_INGEST_URL="https://YOUR-PROJECT.vercel.app/api/ingest"
$env:CVAR_INGEST_KEY="THE-SAME-VALUE-AS-CVAR_INGEST_SECRET"
$env:CVAR_EVENT_ID="canyon-classic-2026"
$env:CVAR_EVENT_NAME="Canyon Classic at ECR"
$env:CVAR_TRACK_LENGTH="2.7 mi · 15 turns"
$env:CVAR_SESSION_MODE="auto"
npm run relay
```

The relay sends lap crossings immediately and refreshes the board at least every 10 seconds. Set `CVAR_PUBLISH_INTERVAL_MS` to change the idle refresh interval.

### Keep the relay running automatically on macOS

After `.env.live` is configured, install the per-user launch service once:

```bash
npm run relay:service:install
```

The installer copies the relay and its protected environment file into `~/Library/Application Support/CVAR-LapTime/`, outside macOS-protected Documents folders. The service starts at login, restarts automatically if it exits, and reconnects when the Orbits TCP feed returns. Re-run the install command after updating the relay code or `.env.live`. Check it with `npm run relay:service:status` and remove it with `npm run relay:service:uninstall`. Logs are stored in `~/Library/Logs/CVAR/`.

Set `CVAR_SESSION_MODE` to `race` or `practice` if a session name does not contain an obvious word such as Race, Practice, or Qualifying.

When it is working, the terminal prints messages such as:

```text
Connected to Orbits. Waiting for timing records.
Published 18 cars · Group 7 Race · GREEN
```

If the relay connects after Orbits has already been running, press **F2** in Orbits to refresh the scoreboard feed.

## Before meeting the timer

Set the four connection variables from the previous section, then run:

```bash
npm run preflight
```

This checks the two links that matter: the local Orbits TCP feed and the Vercel/Redis ingest endpoint. Both should report `PASS`.

During a short test session, capture the exact feed sent by CVAR's Orbits setup:

```bash
npm run record
```

Stop it with Ctrl+C. Recordings are saved under `recordings/`, which Git ignores because the files can include driver names and transponder identifiers. The normal relay also keeps a raw local backup by default while sending parsed timing, CVAR group, class, session metadata, and the raw protocol stream to the private cloud archive. See the [data storage notes](docs/DATA-STORAGE.md) and [meeting checklist](docs/MEETING-CHECKLIST.md).

Timing staff can use `/control` for the private roster and archive. It requires the separate `CVAR_ADMIN_PASSWORD` server setting and never exposes transponder or registration records through the public live-timing endpoint.

## Rehearse without the timing hardware

Use two terminal windows. In the first:

```bash
npm run simulate
```

In the second, set the same relay variables shown above and run:

```bash
npm run relay
```

The simulator emits RMonitor-style timing records on `127.0.0.1:50000`. The public timing board should switch from **Demo mode** to **Timing feed live**.

## Track-day checklist

- Confirm Orbits version, feed type, IP address, port, and RMonitor availability with the timer/MYLAPS.
- Test the complete relay using the actual Orbits computer before traveling to the track.
- Confirm the Orbits computer can reach the Vercel URL over the event internet connection.
- Allow the selected TCP port through Windows Firewall only on the private timing network.
- Keep the relay terminal and, if used, the Local App Feed window open.
- Press F2 after connecting and whenever the displayed field looks incomplete.
- Keep [Speedhive Live Timing](https://mylaps.com/motorsports/services/speedhive/) as the no-code fallback. Orbits can publish to it directly.

## Limits of one start/finish loop

The website can show official lap times, best laps, completed laps, flag/session status, and Orbits' computed standings. It cannot show sector times, speed traps, or a car's physical location around the circuit unless more timing loops or a separate tracking system are added.

## Development

```bash
npm install
npm run dev
npm test
npm run build
```

Useful references:

- [MYLAPS X2 System](https://mylaps.com/motorsports/timing/x2-system/)
- [MYLAPS Speedhive and Live Timing](https://mylaps.com/motorsports/services/speedhive/)
- [Orbits RMonitor feed instructions](https://support.myracepass.com/hc/en-us/articles/115003622948-Finding-the-RMonitor-IP-Address-and-Port-in-MyLaps-Orbits)
- [Vercel Functions](https://vercel.com/docs/functions/runtimes/node-js)
- [Redis on Vercel](https://vercel.com/docs/redis)
