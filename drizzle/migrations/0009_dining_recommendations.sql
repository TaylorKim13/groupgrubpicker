-- All access uses authenticated room-pass server functions, including for guests.
CREATE TABLE public.dining_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preferences jsonb NOT NULL CHECK (jsonb_typeof(preferences) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.room_dining_preferences (
  member_id uuid PRIMARY KEY REFERENCES public.members(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  preferences jsonb NOT NULL CHECK (jsonb_typeof(preferences) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX room_dining_preferences_room_idx ON public.room_dining_preferences(room_id);
-- Serialize with the host opening voting, and enforce seat/room consistency.
CREATE FUNCTION public.guard_room_dining_preferences() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE phase text;
BEGIN
  SELECT status INTO phase FROM public.rooms WHERE id = NEW.room_id FOR UPDATE;
  IF phase IS DISTINCT FROM 'lobby' THEN RAISE EXCEPTION 'Preferences are locked once voting starts'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.members WHERE id = NEW.member_id AND room_id = NEW.room_id)
    THEN RAISE EXCEPTION 'Not a member of this room'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_room_dining_preferences() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_room_dining_preferences BEFORE INSERT OR UPDATE ON public.room_dining_preferences
  FOR EACH ROW EXECUTE FUNCTION public.guard_room_dining_preferences();
CREATE TABLE public.dining_feedback (
  member_id uuid PRIMARY KEY REFERENCES public.members(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  restaurant_id text NOT NULL,
  visited boolean NOT NULL,
  enjoyed boolean,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (visited OR enjoyed IS NULL)
);
CREATE INDEX dining_feedback_room_idx ON public.dining_feedback(room_id);
CREATE TABLE public.room_dining_suggestions (
  room_id uuid PRIMARY KEY REFERENCES public.rooms(id) ON DELETE CASCADE,
  fingerprint text,
  suggestions jsonb,
  method text NOT NULL DEFAULT 'rules' CHECK (method IN ('rules', 'openai')),
  generated_at timestamptz,
  pending_fingerprint text,
  lease_until timestamptz NOT NULL DEFAULT '-infinity',
  requested_at timestamptz NOT NULL DEFAULT '-infinity'
);
ALTER TABLE public.dining_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_dining_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dining_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_dining_suggestions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dining_preferences, public.room_dining_preferences, public.dining_feedback,
  public.room_dining_suggestions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.dining_preferences, public.room_dining_preferences, public.dining_feedback,
  public.room_dining_suggestions TO service_role;

-- One generation per room at a time, including across server instances.
CREATE FUNCTION public.claim_dining_suggestions(p_room_id uuid, p_fingerprint text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE claimed uuid;
BEGIN
  INSERT INTO public.room_dining_suggestions AS existing
    (room_id, pending_fingerprint, lease_until, requested_at)
    VALUES (p_room_id, p_fingerprint, now() + interval '30 seconds', now())
  ON CONFLICT (room_id) DO UPDATE SET
    pending_fingerprint = p_fingerprint,
    lease_until = now() + interval '30 seconds', requested_at = now()
  WHERE existing.lease_until < now()
    AND existing.fingerprint IS DISTINCT FROM p_fingerprint
    AND existing.requested_at < now() - interval '5 seconds'
  RETURNING room_id INTO claimed;
  RETURN claimed IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_dining_suggestions(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_dining_suggestions(uuid, text) TO service_role;

CREATE FUNCTION public.clear_deleted_user_dining_data() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.room_dining_preferences WHERE member_id IN
    (SELECT id FROM public.members WHERE user_id = OLD.id);
  DELETE FROM public.dining_feedback WHERE member_id IN
    (SELECT id FROM public.members WHERE user_id = OLD.id);
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.clear_deleted_user_dining_data() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER clear_deleted_user_dining_data BEFORE DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.clear_deleted_user_dining_data();
