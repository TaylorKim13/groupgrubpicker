CREATE TABLE public.room_pool_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  restaurant_id text NOT NULL,
  restaurant jsonb NOT NULL,
  added_by uuid REFERENCES public.members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, restaurant_id)
);

GRANT ALL ON public.room_pool_selections TO service_role;
ALTER TABLE public.room_pool_selections ENABLE ROW LEVEL SECURITY;
CREATE INDEX room_pool_selections_room_idx ON public.room_pool_selections(room_id, created_at);

COMMENT ON TABLE public.room_pool_selections IS 'Restaurants intentionally selected by room members for voting; accessed only through authenticated server functions.';
