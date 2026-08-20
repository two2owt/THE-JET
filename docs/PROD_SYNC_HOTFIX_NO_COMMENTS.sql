
DO $$
DECLARE
  fn record;
  authed_fns text[] := ARRAY[
    'admin_list_user_emails','admin_user_directory','admin_user_sync_status',
    'apply_retention_schedule','check_connection_rate_limit','claim_push_subscription',
    'discoverable_profiles_rows','has_role','preflight_check_advisory_locks',
    'profiles_secure_rows'
  ];
BEGIN
  FOR fn IN
    SELECT p.oid,
           p.proname,
           'public.' || quote_ident(p.proname) || '(' ||
             pg_get_function_identity_arguments(p.oid) || ')' AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.prorettype <> 'trigger'::regtype
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);
    IF fn.proname = ANY (authed_fns) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn.sig);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE v record;
BEGIN
  FOR v IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'v'
  LOOP
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = on)', v.relname);
  END LOOP;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'user_locations','notification_logs','deal_shares','profiles',
    'user_consents','security_audit_logs','push_notifications'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS marketing_emails_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_consent_updated_at timestamptz;

CREATE TABLE IF NOT EXISTS public.marketing_audience_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience_id text NOT NULL,
  synced_count integer NOT NULL DEFAULT 0,
  removed_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.marketing_audience_sync_log TO authenticated;
GRANT ALL    ON public.marketing_audience_sync_log TO service_role;

ALTER TABLE public.marketing_audience_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view marketing sync log" ON public.marketing_audience_sync_log;
CREATE POLICY "Admins can view marketing sync log"
  ON public.marketing_audience_sync_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

SELECT
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'execute'))            AS anon_executable_definer_fns,
  (SELECT string_agg(c.relname || '=' ||
      coalesce((SELECT option_value FROM pg_options_to_table(c.reloptions)
                WHERE option_name='security_invoker'), 'off'), ', ')
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname='public' AND c.relkind='v')                       AS views,
  (SELECT string_agg(tablename, ',' ORDER BY tablename)
     FROM pg_publication_tables
     WHERE pubname='supabase_realtime' AND schemaname='public')        AS realtime_tables,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='user_preferences' AND column_name LIKE 'marketing%') AS marketing_cols;
