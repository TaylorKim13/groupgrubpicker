-- One record per observed voting session. No names, votes, coordinates, or prices
-- are copied into analytics. Historical sessions are not guessed/backfilled.
CREATE TABLE public.room_filter_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid UNIQUE REFERENCES public.rooms(id) ON DELETE SET NULL,
  tracking_started_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  location_filter_applied_at timestamptz,
  price_filter_applied_at timestamptz,
  voting_started_at timestamptz,
  restaurant_selected_at timestamptz
);
ALTER TABLE public.room_filter_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.room_filter_usage FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.room_filter_usage TO service_role;

-- A non-default saved radius/budget is already an applied filter when the room
-- is created. Baselines match DEFAULT_SETTINGS: 5 km and price levels 1 through 4.
INSERT INTO public.room_filter_usage (room_id, location_filter_applied_at, price_filter_applied_at)
SELECT id,
  CASE WHEN COALESCE(settings->'radiusKm', '5'::jsonb) <> '5'::jsonb THEN statement_timestamp() END,
  CASE WHEN COALESCE(settings->'priceMin', '1'::jsonb) <> '1'::jsonb
    OR COALESCE(settings->'priceMax', '4'::jsonb) <> '4'::jsonb THEN statement_timestamp() END
FROM public.rooms WHERE status = 'lobby';

CREATE FUNCTION public.track_room_filter_usage() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE moment timestamptz := statement_timestamp();
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'lobby' THEN
      INSERT INTO public.room_filter_usage(room_id, location_filter_applied_at, price_filter_applied_at)
      VALUES (NEW.id,
        CASE WHEN COALESCE(NEW.settings->'radiusKm', '5'::jsonb) <> '5'::jsonb THEN moment END,
        CASE WHEN COALESCE(NEW.settings->'priceMin', '1'::jsonb) <> '1'::jsonb
          OR COALESCE(NEW.settings->'priceMax', '4'::jsonb) <> '4'::jsonb THEN moment END)
      ON CONFLICT (room_id) DO NOTHING;
    END IF;
    RETURN NEW;
  END IF;

  -- Updates to historical voting/closed rooms without a tracking row stay excluded.
  UPDATE public.room_filter_usage SET
    location_filter_applied_at = COALESCE(location_filter_applied_at,
      CASE WHEN voting_started_at IS NULL AND OLD.status = 'lobby' AND (
        OLD.settings->'radiusKm' IS DISTINCT FROM NEW.settings->'radiusKm'
        OR OLD.settings #> '{center,lat}' IS DISTINCT FROM NEW.settings #> '{center,lat}'
        OR OLD.settings #> '{center,lng}' IS DISTINCT FROM NEW.settings #> '{center,lng}'
      ) THEN moment END),
    price_filter_applied_at = COALESCE(price_filter_applied_at,
      CASE WHEN voting_started_at IS NULL AND OLD.status = 'lobby' AND (
        OLD.settings->'priceMin' IS DISTINCT FROM NEW.settings->'priceMin'
        OR OLD.settings->'priceMax' IS DISTINCT FROM NEW.settings->'priceMax'
      ) THEN moment END),
    voting_started_at = COALESCE(voting_started_at,
      CASE WHEN OLD.status = 'lobby' AND NEW.status = 'voting' THEN moment END),
    restaurant_selected_at = COALESCE(restaurant_selected_at,
      CASE WHEN voting_started_at IS NOT NULL AND NEW.status = 'closed'
        AND NEW.result->'winner' IS NOT NULL AND NEW.result->'winner' <> 'null'::jsonb THEN moment END)
  WHERE room_id = NEW.id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.track_room_filter_usage() FROM PUBLIC;
CREATE TRIGGER track_room_filter_usage
AFTER INSERT OR UPDATE OF settings, status, result ON public.rooms
FOR EACH ROW EXECUTE FUNCTION public.track_room_filter_usage();

CREATE VIEW public.filter_usage_metrics WITH (security_invoker = true) AS
WITH counts AS (
  SELECT count(*) AS total_voting_sessions,
    count(*) FILTER (WHERE location_filter_applied_at IS NOT NULL
      OR price_filter_applied_at IS NOT NULL) AS filtered_voting_sessions,
    count(*) FILTER (WHERE location_filter_applied_at IS NOT NULL) AS location_filter_sessions,
    count(*) FILTER (WHERE price_filter_applied_at IS NOT NULL) AS price_filter_sessions
  FROM public.room_filter_usage WHERE voting_started_at IS NOT NULL
)
SELECT *, round(100.0 * filtered_voting_sessions / NULLIF(total_voting_sessions, 0), 1)
    AS filter_usage_rate_percent,
  60 AS target_percent,
  CASE WHEN total_voting_sessions > 0 THEN filtered_voting_sessions * 100 >= total_voting_sessions * 60 END AS target_met
FROM counts;
REVOKE ALL ON public.filter_usage_metrics FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.filter_usage_metrics TO service_role;
