CREATE TABLE public.group_creation_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid UNIQUE REFERENCES public.rooms(id) ON DELETE SET NULL,
  host_member_id uuid UNIQUE REFERENCES public.members(id) ON DELETE SET NULL,
  journey_id uuid,
  click_count integer CHECK (click_count >= 0 AND click_count <= 1000000),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
ALTER TABLE public.group_creation_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.group_creation_usage FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.group_creation_usage TO service_role;

-- A successfully inserted host proves creation. Missing telemetry stays NULL, not zero.
CREATE FUNCTION public.track_group_creation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_host THEN
    INSERT INTO public.group_creation_usage(room_id, host_member_id)
      VALUES (NEW.room_id, NEW.id) ON CONFLICT (room_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.track_group_creation() FROM PUBLIC;
CREATE TRIGGER track_group_creation AFTER INSERT ON public.members
FOR EACH ROW EXECUTE FUNCTION public.track_group_creation();

CREATE VIEW public.group_creation_click_metrics WITH (security_invoker = true) AS
SELECT count(*) AS created_groups,
  count(click_count) AS measured_groups,
  count(*) FILTER (WHERE click_count IS NULL) AS unmeasured_groups,
  round(avg(click_count), 2) AS average_clicks,
  count(*) FILTER (WHERE click_count <= 3) AS groups_within_target,
  round(100.0 * count(click_count) / NULLIF(count(*), 0), 1) AS measurement_coverage_percent,
  3 AS target_clicks,
  CASE WHEN count(*) > 0 AND count(click_count) = count(*)
    THEN sum(click_count) <= count(*) * 3 END AS target_met
FROM public.group_creation_usage;
REVOKE ALL ON public.group_creation_click_metrics FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.group_creation_click_metrics TO service_role;
