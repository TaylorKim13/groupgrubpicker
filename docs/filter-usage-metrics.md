# Objective 2: location and price filter usage

Apply `drizzle/migrations/0004_filter_usage_metrics.sql` after the earlier migrations.
The team can run this in the project's database SQL editor:

```sql
SELECT * FROM public.filter_usage_metrics;
```

| Field                                               | Meaning                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------- |
| `filtered_voting_sessions`                          | Sessions that used location or price filtering before selection           |
| `total_voting_sessions`                             | All observed sessions that started voting, including in-progress sessions |
| `filter_usage_rate_percent`                         | Qualifying sessions ÷ total sessions × 100                                |
| `target_percent`                                    | 60                                                                        |
| `target_met`                                        | Whether the unrounded usage rate is at least 60%                          |
| `location_filter_sessions`, `price_filter_sessions` | Category breakdown; a session can appear in both                          |

For example, 3 qualifying sessions out of 5 produces 60% and meets the target.
With no voting sessions, the percentage and target result are NULL (no data).

## Counting rules

- One room is one session, counted once on its first lobby-to-voting transition.
  Lobby-only rooms and failed creations are excluded. Closing/retrying a session
  never adds another count.
- A successful change to search coordinates or radius counts as location usage.
  Changing the address label alone does not count. An automatically supplied initial
  search center does not count as a deliberate location-filter action.
- A successful change to either end of the price range counts as price usage.
  Wait-time, dietary, visibility, and anonymous-voting edits alone do not qualify.
- A non-default initial radius or price range, including saved hosting preferences,
  qualifies. Baselines match the current app defaults: 5 km and price levels 1–4.
- Untouched defaults do not count. Applying both location and price filters counts
  once in the numerator. Reverting an applied filter still counts as using filters.
- Filter attribution freezes when voting starts, before any restaurant can be
  selected. Later changes cannot retroactively improve the rate. The winner-selection
  timestamp is recorded when the room closes with a result.
- Tracking starts with this migration. Existing lobby rooms are eligible for their
  upcoming vote; already voting/closed rooms are excluded because their history is
  unknown. Deleted rooms retain anonymous session counts.

The trigger records successful database writes in the same transaction as the room
change. Failed/rolled-back requests do not count. The report stores timestamps and
an internal room reference, without copying votes, names, coordinates, or prices.
Both the report and underlying tracking table are private to database administrators
and the server service role; guests and signed-in browser clients have no access.

## Verification

With the optional test runtime installed (`npm install --no-save --package-lock=false
@electric-sql/pglite`), run `npm run test:metrics`. This exercises the actual migration
in an isolated PostgreSQL database and does not contact the live project.
