# Timing data storage

The relay converts the local Orbits RMonitor stream into normalized records before sending it over authenticated HTTPS. The public site never connects directly to the timing-network computer.

Upstash Redis stores:

- the latest public classification;
- the latest classification for every detected session;
- every unique `$J` lap passing, including lap and total time;
- car number, driver, car, class, registration identifier, and transponder assignment; and
- an event index and session start times.

There is no automatic expiration on archived sessions or passings. Repeated `$F`, `$G`, and `$H` scoreboard refreshes update the current classification instead of creating duplicate history records. Raw RMonitor recordings remain local and Git-ignored because they can contain personal data.

The archive API is intentionally private. Send the same bearer secret used by the relay:

```text
GET /api/archive?event=canyon-classic-2026
GET /api/archive?event=canyon-classic-2026&session=SESSION_ID
Authorization: Bearer CVAR_INGEST_SECRET
```

The event response lists sessions and registrations. The session response contains its latest classification and ordered lap passings. A future transponder-sheet importer can upsert corrections into the same event registration map without changing the live feed.
