# Restaurant information and selection abandonment

Apply `drizzle/migrations/0005_selection_abandonment.sql`, then use the private
database SQL editor to run:

```sql
SELECT * FROM public.selection_abandonment_metrics;
```

| Field                      | Meaning                                                                     |
| -------------------------- | --------------------------------------------------------------------------- |
| `entered_users`            | Participants observed viewing restaurant information/selection              |
| `selected_users`           | Participants who successfully submitted a vote                              |
| `abandoned_users`          | Participants without a successful vote and inactive for at least 15 minutes |
| `pending_users`            | Participants who have not voted but are still inside that grace period      |
| `abandonment_rate_percent` | Abandoned participants ÷ entered participants × 100                         |
| `target_met`               | Whether the unrounded rate is strictly below 20%                            |

One "user" means one room participant/seat, including guests. Reopening or refreshing
with the same room pass does not create another entry. The same person participating
in another room represents a separate selection journey. There is no cross-room
identity tracking. Rejoining with a new guest seat cannot be identified as the same
person without an account or additional tracking.

Entry is recorded when the restaurant pool mounts in the lobby or voting stage.
Loading screens and the final results screen do not count. The client reports visible
stage entry, interaction activity, hidden tabs, page departures, and route exits.
Activity heartbeats are throttled to 30 seconds and an idle open tab does not keep
itself active indefinitely. Departure delivery is best-effort, using keepalive fetch;
the inactivity rule covers lost exits, crashes, and disconnected browsers.

Submitting a vote successfully is completion. Clicking a restaurant, selecting a Want
or Could locally, and failed submissions do not complete the stage. Completion is
recorded in the same database transaction as the vote; retries and vote edits do not
double-count. A committed vote can establish a completed entry if initial telemetry
was lost. Existing memberships and historical votes are not backfilled.

Recent exits remain pending during the 15-minute grace period. Returning clears the
exit and refreshes activity on the same entry; submitting a vote then counts as
completed. This is a current-outcome report, not an immutable count of every temporary
departure. Pending users are included in the denominator, so recent cohorts remain
provisional until they select or become inactive. With no entries, the percentage
and target status are NULL. Exactly 20% does **not** meet the target.

Only internal room/member references and timestamps are stored, without names,
account IDs, vote choices, coordinates, or profile photos. Anonymous counts survive
room cleanup. The table, activity RPC, and aggregate view are accessible only to the
server service role and database administrators. Every activity request from a browser
passes through `room.functions.ts` and verifies the member's hashed room pass. Tracking
errors do not block voting. Normal room polling remains at 2.5 seconds.

Run `npm run test:abandonment` for isolated PostgreSQL checks with the optional
`@electric-sql/pglite` test runtime installed, as described in the other metrics guide.
Live browser delivery still needs a configured backend and the migration applied.
