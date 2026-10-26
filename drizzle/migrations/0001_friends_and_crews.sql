ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS friend_code text;
UPDATE public.profiles SET friend_code = upper(substr(md5(random()::text || id::text), 1, 8)) WHERE friend_code IS NULL;
ALTER TABLE public.profiles ALTER COLUMN friend_code SET DEFAULT upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
ALTER TABLE public.profiles ALTER COLUMN friend_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_friend_code_key ON public.profiles(friend_code);

CREATE TABLE public.friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (requester_id <> addressee_id)
);
CREATE UNIQUE INDEX friendships_pair_key ON public.friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
GRANT ALL ON public.friendships TO service_role;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.crews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.crews TO service_role;
ALTER TABLE public.crews ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.crew_members (
  crew_id uuid NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (crew_id, user_id)
);
GRANT ALL ON public.crew_members TO service_role;
ALTER TABLE public.crew_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.table_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  from_user uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_user uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, to_user)
);
GRANT ALL ON public.table_invites TO service_role;
ALTER TABLE public.table_invites ENABLE ROW LEVEL SECURITY;