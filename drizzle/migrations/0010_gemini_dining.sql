-- Apply after 0009, including on projects where 0009 was already applied.
-- Preserve prior OpenAI-labelled rows; changed input fingerprints regenerate them.
ALTER TABLE public.room_dining_suggestions
  DROP CONSTRAINT room_dining_suggestions_method_check;
ALTER TABLE public.room_dining_suggestions
  ADD CONSTRAINT room_dining_suggestions_method_check
    CHECK (method IN ('rules', 'openai', 'gemini'));
