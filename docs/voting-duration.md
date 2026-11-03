# Restaurant selection within five minutes

Apply `drizzle/migrations/0008_voting_duration.sql` after migration `0004`.
The administrator Metrics tab shows the aggregate and latest 50 session durations.

```sql
SELECT * FROM public.voting_duration_metrics;
SELECT * FROM public.voting_session_durations ORDER BY voting_started_at DESC;
```

One room is one voting session. Duration runs from the first recorded voting start
to the first committed closure with a restaurant winner. Existing database triggers
record these timestamps in the same transaction as the room changes. Failed requests
do not count as selection; retries do not reset the clock or duplicate the session.
The existing analytics records survive room deletion.

The numerator counts durations from zero through 300 seconds inclusive. The denominator
includes every tracked session that started voting, including unfinished sessions.
Lobby-only rooms are excluded. No sessions means a zero count and a NULL percentage.
The report includes earlier sessions already observed by filter tracking; it does not
invent timestamps for untracked historical sessions. No overall percentage target was
specified, so the dashboard reports the count and percentage without a pass/fail target.

Both views are private to database administrators and the server service role.
The app checks administrator access before reading aggregate or session data.
