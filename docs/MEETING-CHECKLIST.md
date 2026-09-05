# MYLAPS / Orbits meeting checklist

The goal is to leave the meeting with one verified TCP feed and one short sample recording. The X2 decoder already sends transponder crossings into Orbits; the website relay starts at Orbits, not at the track loop.

## Ask the timer

- Which Orbits 5 version and license is installed?
- Is the **RMonitor Scoreboard Feed** available, or should we use **Local App Feed**?
- What IP address and TCP port should the relay use? Typical values are `50000` for Scoreboard Feed and `60000` for Local App Feed.
- Can the relay run on the Orbits computer, or may a second Windows laptop join the same private network?
- Does the relay computer have outbound HTTPS access to the Vercel site?
- Can we do a 10–15 minute bench test with a test transponder or replayed session?
- Can CVAR provide a roster/transponder-assignment export before the event?
- Is it acceptable to publish driver names, car descriptions, classes, and transponder-derived timing publicly?

## Confirm the event setup

- Groups are represented consistently: `1`, `2 & 7`, `3`, `4`, `6`, and `SE`.
- `SE` means Screaming Eagles: Spec Boxster, Spec Miata, and Toyota GR86.
- Decide whether to publish Friday Test & Tune, Saturday P&Q / Race 1 / Canyon Cup / Race 2, and Sunday Hardship / Race 3 / Race 4.
- Decide whether the Horsepower4Heroes drive-around should appear as a public session.
- Confirm whether combined Groups 2 & 7 are one Orbits session or separate classes within one session.

## Verify the feed

1. Enable the feed in Orbits and keep the Local App Feed window open if that option is used.
2. If connecting from another computer, allow the selected TCP port through Windows Firewall on the private timing network only.
3. Set `ORBITS_HOST`, `ORBITS_PORT`, `CVAR_INGEST_URL`, and `CVAR_INGEST_KEY`.
4. Run `npm run preflight` and get two PASS results: Vercel/Redis and Orbits TCP.
5. Press **F2** in Orbits so it sends the full scoreboard state.
6. Run `npm run record` for a short sample, then stop it with Ctrl+C.
7. Run `npm run relay` and verify cars, classes, laps, best laps, order, session name, and flag on the public site.

The parser expects standard RMonitor competitor (`$A`/`$COMP`), class (`$C`), race order (`$G`), practice/qualifying order (`$H`), passing (`$J`), and heartbeat/flag (`$F`) records. A sample recording will reveal any site-specific differences before race weekend.

## Backup plan

Confirm that Orbits can publish to [MYLAPS Speedhive](https://mylaps.com/motorsports/services/speedhive/) if the custom relay or venue internet fails.
