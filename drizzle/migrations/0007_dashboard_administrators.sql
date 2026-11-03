CREATE TABLE public.dashboard_administrators (
  email text PRIMARY KEY CHECK (email = lower(btrim(email)) AND length(email) <= 254),
  added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
ALTER TABLE public.dashboard_administrators ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dashboard_administrators FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.dashboard_administrators TO service_role;

INSERT INTO public.dashboard_administrators(email) VALUES
  ('aaronwconlin@gmail.com'),
  ('awestra3@student.byu.edu'),
  ('adria.westra@gmail.com'),
  ('jakeg22@student.byu.edu'),
  ('tkim04@student.byu.edu');
