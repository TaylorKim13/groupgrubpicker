CREATE TABLE public.room_selection_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  member_id uuid UNIQUE REFERENCES public.members(id) ON DELETE SET NULL,
  entered_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  last_seen_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  left_at timestamptz,
  selected_at timestamptz
);
ALTER TABLE public.room_selection_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.room_selection_usage FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.room_selection_usage TO service_role;

-- Called only by a server function after verifying the member's hashed room pass.
CREATE FUNCTION public.record_selection_activity(p_room_id uuid, p_member_id uuid, p_event text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE moment timestamptz := statement_timestamp();
BEGIN
  IF p_event NOT IN ('enter', 'heartbeat', 'leave') OR p_event IS NULL THEN
    RAISE EXCEPTION 'Invalid selection activity';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.members WHERE id = p_member_id AND room_id = p_room_id) THEN
    RAISE EXCEPTION 'Not a member of this room';
  END IF;
  IF p_event = 'leave' THEN
    -- A late departure signal must never create an entry that wasn't observed.
    UPDATE public.room_selection_usage SET left_at = moment
      WHERE member_id = p_member_id AND room_id = p_room_id AND selected_at IS NULL;
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rooms WHERE id = p_room_id AND status IN ('lobby', 'voting')) THEN
    RETURN;
  END IF;
  INSERT INTO public.room_selection_usage(room_id, member_id, entered_at, last_seen_at)
    VALUES (p_room_id, p_member_id, moment, moment)
    ON CONFLICT (member_id) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at, left_at = NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.record_selection_activity(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_selection_activity(uuid, uuid, text) TO service_role;

-- Completion follows the committed vote, never a local card click or failed submit.
CREATE FUNCTION public.complete_restaurant_selection() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE moment timestamptz := statement_timestamp();
BEGIN
  INSERT INTO public.room_selection_usage(room_id, member_id, entered_at, last_seen_at, selected_at)
    VALUES (NEW.room_id, NEW.member_id, moment, moment, moment)
    ON CONFLICT (member_id) DO UPDATE SET
      selected_at = COALESCE(room_selection_usage.selected_at, EXCLUDED.selected_at),
      last_seen_at = EXCLUDED.last_seen_at, left_at = NULL;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_restaurant_selection() FROM PUBLIC;
CREATE TRIGGER complete_restaurant_selection AFTER INSERT OR UPDATE ON public.votes
FOR EACH ROW EXECUTE FUNCTION public.complete_restaurant_selection();

-- No backfill: existing votes and memberships don't prove a new stage entry.
CREATE VIEW public.selection_abandonment_metrics WITH (security_invoker = true) AS
WITH counts AS (
  SELECT count(*) AS entered_users,
    count(*) FILTER (WHERE selected_at IS NOT NULL) AS selected_users,
    count(*) FILTER (WHERE selected_at IS NULL AND last_seen_at <= statement_timestamp() - INTERVAL '15 minutes') AS abandoned_users,
    count(*) FILTER (WHERE selected_at IS NULL AND last_seen_at > statement_timestamp() - INTERVAL '15 minutes') AS pending_users
  FROM public.room_selection_usage
)
SELECT *, round(100.0 * abandoned_users / NULLIF(entered_users, 0), 1) AS abandonment_rate_percent,
  20 AS target_percent, 15 AS inactivity_minutes,
  CASE WHEN entered_users > 0 THEN abandoned_users * 100 < entered_users * 20 END AS target_met
FROM counts;
REVOKE ALL ON public.selection_abandonment_metrics FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.selection_abandonment_metrics TO service_role;
