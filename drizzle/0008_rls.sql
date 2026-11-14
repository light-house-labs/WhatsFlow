-- Supabase exposes every table in `public` through its REST API to the anon key.
-- The app reaches the database as the owner role (which bypasses RLS), so turning
-- RLS on with no policies shuts that side door without affecting the app.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
