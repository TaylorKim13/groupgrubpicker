-- Presence is private and independent of selection analytics and voting.
CREATE TABLE public.room_viewers (
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  tab_id uuid NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  left_at timestamptz,
  PRIMARY KEY (room_id, member_id, tab_id)
);
ALTER TABLE public.room_viewers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.room_viewers FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.room_viewers TO service_role;

CREATE FUNCTION public.record_room_presence(p_room_id uuid, p_member_id uuid, p_tab_id uuid, p_visible boolean)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  -- Serialize check-ins and automatic closure for this room.
  PERFORM 1 FROM rooms WHERE id = p_room_id AND status IN ('lobby', 'voting') FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM members WHERE id = p_member_id AND room_id = p_room_id) THEN
    RAISE EXCEPTION 'Not a member of this room';
  END IF;
  IF p_visible THEN
    INSERT INTO room_viewers(room_id, member_id, tab_id) VALUES (p_room_id, p_member_id, p_tab_id)
      ON CONFLICT (room_id, member_id, tab_id) DO UPDATE
      SET last_seen_at = statement_timestamp(), left_at = NULL;
  ELSE
    UPDATE room_viewers SET left_at = statement_timestamp()
      WHERE room_id = p_room_id AND member_id = p_member_id AND tab_id = p_tab_id AND left_at IS NULL;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.record_room_presence(uuid, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_room_presence(uuid, uuid, uuid, boolean) TO service_role;

CREATE FUNCTION public.close_empty_rooms() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; closed_count integer := 0;
BEGIN
  FOR r IN SELECT id, created_at FROM rooms WHERE status IN ('lobby', 'voting') FOR UPDATE SKIP LOCKED LOOP
    IF r.created_at < statement_timestamp() - interval '90 seconds'
      AND NOT EXISTS (
        SELECT 1 FROM room_viewers v WHERE v.room_id = r.id
          AND greatest(v.last_seen_at, v.left_at) >= statement_timestamp() - interval '90 seconds'
      ) THEN
      UPDATE rooms SET status = 'closed', closed_at = statement_timestamp() WHERE id = r.id;
      closed_count := closed_count + 1;
    END IF;
  END LOOP;
  DELETE FROM room_viewers WHERE greatest(last_seen_at, left_at) < statement_timestamp() - interval '1 day';
  RETURN closed_count;
END;
$$;
REVOKE ALL ON FUNCTION public.close_empty_rooms() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_empty_rooms() TO service_role;

-- Run even when no browsers are open or polling the app.
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('close-empty-dining-rooms', '* * * * *', 'SELECT public.close_empty_rooms()');
