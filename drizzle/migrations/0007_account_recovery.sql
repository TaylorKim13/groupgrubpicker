-- Nicknames may repeat. Only this unique username can identify an account.
-- Existing accounts remain recoverable by email and can choose a username in Settings.
ALTER TABLE public.profiles ADD COLUMN username text;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_format
  CHECK (username IS NULL OR username ~ '^[a-z0-9_]{3,24}$');
CREATE UNIQUE INDEX profiles_username_key ON public.profiles(username) WHERE username IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_grub_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.profiles(id, display_name, username)
  VALUES (NEW.id, LEFT(COALESCE(NEW.raw_user_meta_data->>'full_name', ''), 24),
    nullif(lower(btrim(NEW.raw_user_meta_data->>'username')), ''));
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.create_grub_profile() FROM PUBLIC;

CREATE TABLE public.account_recovery_limits (
  key_hash text PRIMARY KEY,
  window_started timestamptz NOT NULL,
  last_requested timestamptz NOT NULL,
  attempts integer NOT NULL
);
CREATE INDEX account_recovery_limits_cleanup ON public.account_recovery_limits(last_requested);
ALTER TABLE public.account_recovery_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_recovery_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.account_recovery_limits TO service_role;

CREATE FUNCTION public.claim_grub_recovery(p_key text, p_limit integer, p_cooldown integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE claimed text;
BEGIN
  INSERT INTO public.account_recovery_limits AS limits (key_hash, window_started, last_requested, attempts)
  VALUES (encode(sha256(convert_to(p_key, 'UTF8')), 'hex'), now(), now(), 1)
  ON CONFLICT (key_hash) DO UPDATE SET
    window_started = CASE WHEN limits.window_started < now() - interval '1 hour' THEN now() ELSE limits.window_started END,
    attempts = CASE WHEN limits.window_started < now() - interval '1 hour' THEN 1 ELSE limits.attempts + 1 END,
    last_requested = now()
  WHERE limits.last_requested <= now() - make_interval(secs => p_cooldown)
    AND (limits.window_started < now() - interval '1 hour' OR limits.attempts < p_limit)
  RETURNING key_hash INTO claimed;
  RETURN claimed IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_grub_recovery(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_grub_recovery(text, integer, integer) TO service_role;

-- Only the server may resolve usernames into emails. No email enters a browser response.
CREATE FUNCTION public.resolve_grub_recovery(p_kind text, p_identifier text, p_requester text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE normalized text := lower(btrim(p_identifier)); matched_id uuid; matched_email text;
BEGIN
  IF p_kind NOT IN ('email', 'username') OR normalized IS NULL OR length(normalized) > 254
    OR (p_kind = 'username' AND normalized !~ '^[a-z0-9_]{3,24}$') THEN
    RETURN NULL;
  END IF;
  DELETE FROM public.account_recovery_limits WHERE last_requested < now() - interval '1 day';
  IF NOT public.claim_grub_recovery('requester:' || coalesce(p_requester, 'unknown'), 30, 0) THEN RETURN NULL; END IF;
  IF NOT public.claim_grub_recovery(p_kind || ':' || normalized, 5, 60) THEN RETURN NULL; END IF;
  IF p_kind = 'email' THEN
    SELECT id, email INTO matched_id, matched_email FROM auth.users WHERE lower(email) = normalized LIMIT 1;
  ELSE
    SELECT u.id, u.email INTO matched_id, matched_email FROM public.profiles p
      JOIN auth.users u ON u.id = p.id WHERE p.username = normalized;
  END IF;
  IF matched_id IS NULL OR matched_email IS NULL THEN RETURN NULL; END IF;
  -- A shared bucket prevents bypassing the email limit by switching identifiers.
  IF NOT public.claim_grub_recovery('account:' || matched_id::text, 5, 60) THEN RETURN NULL; END IF;
  RETURN matched_email;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_grub_recovery(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_grub_recovery(text, text, text) TO service_role;
