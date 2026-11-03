-- Reuse transaction-recorded timestamps; no client timers or historical guesses.
CREATE VIEW public.voting_session_durations WITH (security_invoker = true) AS
SELECT id AS session_id, voting_started_at, restaurant_selected_at,
  extract(epoch FROM (restaurant_selected_at - voting_started_at))::double precision AS duration_seconds,
  CASE WHEN restaurant_selected_at IS NOT NULL THEN
    restaurant_selected_at >= voting_started_at
    AND restaurant_selected_at <= voting_started_at + interval '5 minutes'
  END AS finished_within_five_minutes
FROM public.room_filter_usage WHERE voting_started_at IS NOT NULL;
REVOKE ALL ON public.voting_session_durations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.voting_session_durations TO service_role;

CREATE VIEW public.voting_duration_metrics WITH (security_invoker = true) AS
SELECT count(*) AS total_voting_sessions,
  count(restaurant_selected_at) AS completed_sessions,
  count(*) FILTER (WHERE finished_within_five_minutes) AS sessions_within_five_minutes,
  count(*) FILTER (WHERE restaurant_selected_at IS NULL) AS unfinished_sessions,
  round(100.0 * count(*) FILTER (WHERE finished_within_five_minutes) / NULLIF(count(*), 0), 1)
    AS within_five_minutes_percent
FROM public.voting_session_durations;
REVOKE ALL ON public.voting_duration_metrics FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.voting_duration_metrics TO service_role;
