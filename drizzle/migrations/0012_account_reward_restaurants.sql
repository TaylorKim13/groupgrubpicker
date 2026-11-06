ALTER TABLE public.profiles
  ADD COLUMN reward_restaurants text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_reward_restaurants_count
  CHECK (cardinality(reward_restaurants) <= 50);
