CREATE TABLE public.profiles (
 id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 display_name text NOT NULL DEFAULT '',
 avatar text NOT NULL DEFAULT '🍕',
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_own_read ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY profiles_own_insert ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY profiles_own_update ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TABLE public.preset_filters (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 settings jsonb NOT NULL DEFAULT '{}'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.preset_filters TO authenticated;
GRANT ALL ON public.preset_filters TO service_role;
ALTER TABLE public.preset_filters ENABLE ROW LEVEL SECURITY;
CREATE POLICY filters_own_read ON public.preset_filters FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY filters_own_insert ON public.preset_filters FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY filters_own_update ON public.preset_filters FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY filters_own_delete ON public.preset_filters FOR DELETE TO authenticated USING (auth.uid() = user_id);
ALTER TABLE public.members ADD COLUMN user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.rooms ADD COLUMN voting_started_at timestamptz;
ALTER TABLE public.rooms ADD COLUMN closed_at timestamptz;
CREATE TABLE public.room_restaurants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
 restaurant_id text NOT NULL,
 restaurant jsonb NOT NULL,
 distance_km double precision NOT NULL DEFAULT 0,
 points integer NOT NULL DEFAULT 0,
 UNIQUE (room_id, restaurant_id)
);
GRANT ALL ON public.room_restaurants TO service_role;
ALTER TABLE public.room_restaurants ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.rooms, public.members, public.nominations, public.votes TO service_role;
CREATE INDEX members_user_history_idx ON public.members(user_id, created_at DESC);
CREATE FUNCTION public.create_grub_profile() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 INSERT INTO public.profiles(id, display_name) VALUES (NEW.id, LEFT(COALESCE(NEW.raw_user_meta_data->>'full_name', ''), 24)) ON CONFLICT DO NOTHING;
 RETURN NEW;
END;
$$;
CREATE TRIGGER create_grub_profile AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.create_grub_profile();
INSERT INTO public.profiles(id, display_name) SELECT id, LEFT(COALESCE(raw_user_meta_data->>'full_name', ''), 24) FROM auth.users ON CONFLICT DO NOTHING;
COMMENT ON TABLE public.room_restaurants IS 'Room-specific restaurant snapshots: menu/cuisine, cost, wait, distance and final vote totals; mock and estimated fields are preserved as such.';