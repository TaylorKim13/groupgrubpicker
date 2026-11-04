ALTER TABLE public.room_dining_suggestions
  ADD COLUMN context_fingerprint text,
  ADD COLUMN refresh_version integer NOT NULL DEFAULT 0,
  ADD COLUMN generated_version integer NOT NULL DEFAULT 0;
CREATE TABLE public.dining_suggestion_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  fingerprint text NOT NULL,
  context_fingerprint text,
  suggestions jsonb NOT NULL,
  method text NOT NULL,
  generated_at timestamptz NOT NULL,
  UNIQUE(room_id, fingerprint)
);
CREATE INDEX dining_suggestion_history_room_idx ON public.dining_suggestion_history(room_id, generated_at DESC);
ALTER TABLE public.dining_suggestion_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dining_suggestion_history FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.dining_suggestion_history TO service_role;
REVOKE ALL ON SEQUENCE public.dining_suggestion_history_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.dining_suggestion_history_id_seq TO service_role;

CREATE FUNCTION public.refresh_dining_suggestions(p_room_id uuid, p_expected_fingerprint text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE phase text; changed uuid;
BEGIN
  SELECT status INTO phase FROM public.rooms WHERE id=p_room_id FOR UPDATE;
  IF phase IS DISTINCT FROM 'lobby' THEN RAISE EXCEPTION 'Suggestions are locked once voting starts'; END IF;
  UPDATE public.room_dining_suggestions SET refresh_version=refresh_version+1
    WHERE room_id=p_room_id AND fingerprint=p_expected_fingerprint
      AND refresh_version=generated_version AND lease_until < now()
      AND requested_at < now()-interval '5 seconds'
    RETURNING room_id INTO changed;
  RETURN changed IS NOT NULL;
END;
$$;

-- Archive and publish together: a failed save cannot lose the previous set.
CREATE FUNCTION public.complete_dining_suggestions(p_room_id uuid, p_fingerprint text,
  p_context_fingerprint text, p_version integer, p_suggestions jsonb, p_method text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE phase text; previous public.room_dining_suggestions%ROWTYPE;
BEGIN
  SELECT status INTO phase FROM public.rooms WHERE id=p_room_id FOR UPDATE;
  IF phase IS DISTINCT FROM 'lobby' THEN RETURN false; END IF;
  SELECT * INTO previous FROM public.room_dining_suggestions WHERE room_id=p_room_id FOR UPDATE;
  IF NOT FOUND OR previous.pending_fingerprint IS DISTINCT FROM p_fingerprint
    OR previous.refresh_version <> p_version THEN RETURN false; END IF;
  IF previous.fingerprint IS NOT NULL AND previous.generated_at IS NOT NULL AND previous.suggestions IS NOT NULL THEN
    INSERT INTO public.dining_suggestion_history(room_id,fingerprint,context_fingerprint,suggestions,method,generated_at)
      VALUES(p_room_id,previous.fingerprint,previous.context_fingerprint,previous.suggestions,previous.method,previous.generated_at)
      ON CONFLICT(room_id,fingerprint) DO NOTHING;
  END IF;
  UPDATE public.room_dining_suggestions SET fingerprint=p_fingerprint,
    context_fingerprint=p_context_fingerprint, generated_version=p_version,
    suggestions=p_suggestions,method=p_method,generated_at=now(),
    lease_until='-infinity',pending_fingerprint=NULL WHERE room_id=p_room_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_dining_suggestions(uuid,text),
  public.complete_dining_suggestions(uuid,text,text,integer,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_dining_suggestions(uuid,text),
  public.complete_dining_suggestions(uuid,text,text,integer,jsonb,text) TO service_role;
