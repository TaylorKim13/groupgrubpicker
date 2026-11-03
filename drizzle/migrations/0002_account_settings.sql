ALTER TABLE public.profiles ADD COLUMN distance_unit text NOT NULL DEFAULT 'mi'
  CHECK (distance_unit IN ('mi', 'km'));

CREATE FUNCTION public.save_grub_preferences(new_settings jsonb, new_unit text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  UPDATE public.profiles SET distance_unit = new_unit WHERE id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
  INSERT INTO public.preset_filters(user_id, settings, updated_at)
    VALUES (auth.uid(), new_settings, now())
    ON CONFLICT (user_id) DO UPDATE SET settings = EXCLUDED.settings, updated_at = EXCLUDED.updated_at;
END;
$$;
REVOKE ALL ON FUNCTION public.save_grub_preferences(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_grub_preferences(jsonb, text) TO authenticated;

-- Walk snapshots without changing restaurant IDs, scores, or ordering.
CREATE FUNCTION public.anonymize_grub_snapshot(value jsonb, member_id uuid, member_name text)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE result jsonb; item record;
BEGIN
  IF jsonb_typeof(value) = 'array' THEN
    SELECT COALESCE(jsonb_agg(public.anonymize_grub_snapshot(v, member_id, member_name) ORDER BY ord), '[]'::jsonb)
      INTO result FROM jsonb_array_elements(value) WITH ORDINALITY AS a(v, ord);
    RETURN result;
  ELSIF jsonb_typeof(value) = 'object' THEN
    result := value;
    FOR item IN SELECT key, val FROM jsonb_each(value) AS e(key, val) LOOP
      result := jsonb_set(result, ARRAY[item.key], public.anonymize_grub_snapshot(item.val, member_id, member_name));
    END LOOP;
    IF value ? 'nominatedBy' AND (value->>'nominatedByMemberId' = member_id::text
      OR (NOT value ? 'nominatedByMemberId' AND value->>'nominatedBy' = member_name)) THEN
      result := jsonb_set(result - 'nominatedByMemberId', '{nominatedBy}', '"Deleted member"'::jsonb);
    END IF;
    RETURN result;
  END IF;
  RETURN value;
END;
$$;

CREATE FUNCTION public.anonymize_deleted_grub_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE seat record;
BEGIN
  FOR seat IN SELECT id, room_id, nickname FROM public.members WHERE user_id = OLD.id LOOP
    UPDATE public.nominations SET restaurant = public.anonymize_grub_snapshot(restaurant, seat.id, seat.nickname)
      WHERE member_id = seat.id;
    UPDATE public.room_restaurants SET restaurant = public.anonymize_grub_snapshot(restaurant, seat.id, seat.nickname)
      WHERE room_id = seat.room_id;
    UPDATE public.rooms SET result = public.anonymize_grub_snapshot(result, seat.id, seat.nickname)
      WHERE id = seat.room_id AND result IS NOT NULL;
    UPDATE public.members SET nickname = 'Deleted member', avatar = '🍽️',
      token_hash = md5(random()::text || clock_timestamp()::text || id::text)
      WHERE id = seat.id;
  END LOOP;
  RETURN OLD;
END;
$$;
CREATE TRIGGER anonymize_deleted_grub_profile BEFORE DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.anonymize_deleted_grub_profile();
REVOKE ALL ON FUNCTION public.anonymize_deleted_grub_profile() FROM PUBLIC;
