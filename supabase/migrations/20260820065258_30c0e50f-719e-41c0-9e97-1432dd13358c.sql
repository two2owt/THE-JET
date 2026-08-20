DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['postgres','authenticated','service_role','anon'] LOOP
    BEGIN
      EXECUTE format('ALTER ROLE %I SET app.settings.supabase_url = %L', r, 'https://zbrscuoqmkdbmdimdnqu.supabase.co');
      EXECUTE format('ALTER ROLE %I SET app.settings.notify_admin_hook_secret = %L', r, 'f5102eabb7b898f8f5a2460d0efe46c9e5c9e7d56d8d3c05');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('dispatch-ending-soon-favorites');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'dispatch-ending-soon-favorites',
  '*/15 * * * *',
  $$SELECT public.dispatch_ending_soon_favorites();$$
);