# Timing data storage

The relay converts the local Orbits RMonitor stream into normalized records before sending it over authenticated HTTPS. The public site never connects directly to the timing-network computer.

Upstash Redis stores:

- the latest public classification;
- the latest classification for every detected session;
- every unique `$J` lap passing, including lap and total time;
- the Orbits run ID and name, CVAR group, racing class, best-lap number, scoreboard position, session clocks, flag state, and track settings;
- car number, driver, first and last name, the source nationality/group field, additional competitor info, class identifier, registration identifier, and transponder assignment;
- every raw RMonitor record, including unrecognized commands, so later parser improvements can recover fields that are not understood yet; and
- an event index and session start times.

There is no automatic expiration on archived sessions, passings, or raw records. A session is added to the results index only after at least one car appears; empty scoreboard frames remain available to the live feed and private raw archive without creating zero-car result sheets. Repeated `$F`, `$G`, and `$H` scoreboard refreshes update the current classification, while their original protocol lines remain available in the private raw archive. The relay also writes a second raw backup under `recordings/` by default. This directory is Git-ignored because the files can contain driver names, transponder identifiers, and other registration data.

The feed's `$A` and `$COMP` field called “nationality” contains CVAR's group number in the tested event (`6` means `Group 6`). `$C` records are a separate class table (`FF1`, `FF2`, `FC`, and so on). The public timing board displays them separately instead of treating the group as a car description.

Orbits may publish the same registration number for more than one named driver. The parser keeps each different driver/transponder as a separate competitor and assigns display suffixes (`64`, `64a`, `64b`) when the transmitted car numbers collide. The original transmitted number remains in `sourceNumber` in the private registration and passing archives.

When a car number is edited during an active Orbits session, Orbits may retain both the old and new registrations for the same named driver. The public classification keeps only that driver's most complete timing row (highest lap count, then latest completed-lap data) and preserves the full transmitted number, including meaningful suffixes such as `17a`, `64bk`, or `83a`. Different drivers are never combined merely because their car numbers share the same numeric base.

The archive API is intentionally private. Send the same bearer secret used by the relay:

```text
GET /api/archive?event=canyon-classic-2026
GET /api/archive?event=canyon-classic-2026&session=SESSION_ID
GET /api/archive?event=canyon-classic-2026&session=SESSION_ID&raw=1&offset=0&limit=200
Authorization: Bearer CVAR_INGEST_SECRET
```

The event response lists sessions and registrations. The session response contains its latest classification, ordered lap passings, and raw-record count. Add `raw=1` to retrieve the private protocol archive in pages of at most 500 records. A future transponder-sheet importer can enrich or correct the same event registration map without changing the live feed.

Timing staff use `/control`, which is protected by `CVAR_ADMIN_PASSWORD`. A successful login receives an eight-hour, HTTP-only, secure, same-site session cookie signed with `CVAR_INGEST_SECRET`; the password is never saved in browser storage. Login attempts are rate-limited through Redis. The page merges private registration/transponder records with the current standings and provides protected links to each session's passings and paginated raw archive. Set a separate strong control-room password rather than reusing the relay secret.

The Orbits Processing screen can show post-processing fields that are not part of the RMonitor scoreboard stream, including result status, uploaded state, points, and some corrections. Race result sheets include a Points column and preserve numeric `points` values supplied with each car in the stored source snapshot, including zero. Preserve post-processing data after a session by exporting the results and lap-time files from Orbits; those exports can be imported alongside the live archive later.
