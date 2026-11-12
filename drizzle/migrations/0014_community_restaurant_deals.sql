CREATE TABLE IF NOT EXISTS public.restaurant_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id text NOT NULL,
  restaurant_name text NOT NULL,
  restaurant_key text NOT NULL,
  place_id text NOT NULL,
  scope text NOT NULL DEFAULT 'location' CHECK (scope IN ('location', 'chain')),
  title text NOT NULL,
  description text,
  promo_code text,
  redemption_url text,
  terms text,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.restaurant_deals
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS restaurant_name text,
  ADD COLUMN IF NOT EXISTS restaurant_key text,
  ADD COLUMN IF NOT EXISTS place_id text,
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'location',
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.restaurant_deals
  DROP CONSTRAINT IF EXISTS restaurant_deals_scope_check,
  ADD CONSTRAINT restaurant_deals_scope_check CHECK (scope IN ('location', 'chain')),
  DROP CONSTRAINT IF EXISTS restaurant_deals_date_order_check,
  ADD CONSTRAINT restaurant_deals_date_order_check
    CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date);

CREATE INDEX IF NOT EXISTS restaurant_deals_active_location_idx
  ON public.restaurant_deals (restaurant_id, status);
CREATE INDEX IF NOT EXISTS restaurant_deals_active_chain_idx
  ON public.restaurant_deals (restaurant_key, status) WHERE scope = 'chain';

ALTER TABLE public.restaurant_deals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.restaurant_deals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.restaurant_deals TO anon, authenticated;
GRANT ALL ON public.restaurant_deals TO service_role;
DROP POLICY IF EXISTS restaurant_deals_public_active_read ON public.restaurant_deals;
CREATE POLICY restaurant_deals_public_active_read ON public.restaurant_deals
  FOR SELECT TO anon, authenticated USING (status = 'active');
DROP POLICY IF EXISTS restaurant_deals_active_only_guard ON public.restaurant_deals;
CREATE POLICY restaurant_deals_active_only_guard ON public.restaurant_deals
  AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (status = 'active');
