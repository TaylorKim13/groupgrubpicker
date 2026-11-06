ALTER TABLE public.profiles
  DROP CONSTRAINT profiles_reward_restaurants_count;

ALTER TABLE public.profiles
  ALTER COLUMN reward_restaurants DROP DEFAULT,
  ALTER COLUMN reward_restaurants TYPE jsonb USING to_jsonb(reward_restaurants),
  ALTER COLUMN reward_restaurants SET DEFAULT '[]'::jsonb;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_reward_restaurants_count
  CHECK (
    jsonb_typeof(reward_restaurants) = 'array'
    AND jsonb_array_length(reward_restaurants) <= 50
  );
