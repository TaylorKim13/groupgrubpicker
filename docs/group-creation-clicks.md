# Group creation: average of three clicks or fewer

Apply `drizzle/migrations/0006_group_creation_clicks.sql`. In the private database
SQL editor, run:

```sql
SELECT * FROM public.group_creation_click_metrics;

-- One measurement per successful host/creation, including guests:
SELECT host_member_id, room_id, click_count, created_at
FROM public.group_creation_usage
ORDER BY created_at DESC;
```

Each successful creation has equal weight, including repeat creators. The average
is the sum of observed click counts divided by measured successful creations. Three
or fewer meets the target. Per-user means the host participant for that creation;
the system does not identify or fingerprint a guest across different creations.

Counting starts on the landing screen and stops after the server creates a room and
the host's room pass is saved. It includes in-app primary pointer presses: buttons,
nickname field focus, avatars, backtracking, optional walkthrough interactions, and
retry clicks. Label-generated clicks are not counted twice. Keyboard/assistive click
activations and Enter submissions count as equivalent actions; typing, Tab navigation,
scrolling, automatic focus, and browser toolbar clicks are not counted. The normal
flow remains two activations: Start a new table, then Create table.

The same tab preserves its count through refreshes and app navigation. Failed create
requests do not reset it, so a later success includes retry effort. Successfully
joining a group ends the current creation journey. A new successful creation starts
a fresh measurement. Abandoned journeys and failed creations have no successful host
and are excluded from this KR.

Successful host insertion creates a private analytics row in the same database
transaction. A separate authenticated room-pass/host check accepts the click count
once; duplicate deliveries cannot lower it. Reports retry in the background and on
reconnection without blocking creation. The pending payload contains no private room
pass; delivery uses the pass already stored for that room.

`created_groups`, `measured_groups`, `unmeasured_groups`, and
`measurement_coverage_percent` show collection coverage. Missing telemetry remains
NULL rather than becoming zero. `average_clicks` uses measured groups only, and
`target_met` is NULL until every successful creation in the cohort is measured.
With no data, the average and target status are also NULL. Counts are client-observed,
not independent proof of physical clicks; changing device/tab or blocking storage and
scripts limits observation. Browser-close/network failures can leave unmeasured rows.

The table and report are private to database administrators and the server service
role. They store only internal room/host references, a random journey ID, a count,
and a timestamp. Anonymous measurements survive room deletion. Historical creations
are not backfilled. No names, emails, votes, coordinates, or photos are copied.

Run `npm run test:creation-clicks` with the optional `@electric-sql/pglite` runtime
installed for the isolated PostgreSQL integration checks. `npm test` exercises the
client counter and authorized reporting flow. Live collection needs the migration and
the existing backend configuration applied.
