ALTER TABLE public.restaurant_deals
  ADD COLUMN IF NOT EXISTS polished_summary text;
