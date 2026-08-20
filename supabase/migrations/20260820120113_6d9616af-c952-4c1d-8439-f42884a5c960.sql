-- Realtime broadcast guard: continuously verifies that only approved tables are
-- published to supabase_realtime and that every published table still enforces
-- owner-scoped RLS, so a future policy or publication change cannot silently
-- start leaking user_connections / pending statuses to other subscribers.

CREATE TABLE IF NOT EXISTS public.realtime_guard_allowlist (
  table_name text PRIMARY KEY,
  sensitivity text NOT NULL CHECK (sensitivity IN ('private', 'public')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.realtime_guard_allowlist TO authenticated;
GRANT ALL ON public.realtime_guard_allowlist TO service_role;
ALTER TABLE public.realtime_guard_allowlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read realtime allowlist" ON public.realtime_guard_allowlist;
CREATE POLICY "Admins read realtime allowlist"
ON public.realtime_guard_allowlist FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.realtime_guard_allowlist (table_name, sensitivity, note) VALUES
  ('deals',            'public',  'Merchant deals; public SELECT policy is intended'),
  ('user_connections', 'private', 'Requester + recipient only, at any status'),
  ('user_favorites',   'private', 'Owner only'),
  ('search_history',   'private', 'Owner only'),
  ('venue_reviews',    'private', 'Author, admins and accepted connections')
ON CONFLICT (table_name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.realtime_guard_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_name text NOT NULL,
  target text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('critical', 'warning')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  message text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS realtime_guard_alerts_open_key
  ON public.realtime_guard_alerts (check_name, target) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS realtime_guard_alerts_created_idx
  ON public.realtime_guard_alerts (created_at DESC);

GRANT SELECT ON public.realtime_guard_alerts TO authenticated;
GRANT ALL ON public.realtime_guard_alerts TO service_role;
ALTER TABLE public.realtime_guard_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read realtime guard alerts" ON public.realtime_guard_alerts;
CREATE POLICY "Admins read realtime guard alerts"
ON public.realtime_guard_alerts FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS realtime_guard_alerts_updated_at ON public.realtime_guard_alerts;
CREATE TRIGGER realtime_guard_alerts_updated_at
BEFORE UPDATE ON public.realtime_guard_alerts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Point-in-time audit of what Realtime is currently allowed to broadcast.
CREATE OR REPLACE FUNCTION public.realtime_publication_audit()
RETURNS TABLE(
  table_name text,
  approved boolean,
  sensitivity text,
  rls_enabled boolean,
  replica_identity text,
  unscoped_select_policies text[]
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    pt.tablename::text,
    (al.table_name IS NOT NULL),
    COALESCE(al.sensitivity, 'unknown'),
    c.relrowsecurity,
    CASE c.relreplident
      WHEN 'd' THEN 'default' WHEN 'f' THEN 'full'
      WHEN 'i' THEN 'index'   WHEN 'n' THEN 'nothing' END,
    COALESCE(ARRAY(
      SELECT p.polname::text
      FROM pg_policy p
      WHERE p.polrelid = c.oid
        AND p.polcmd IN ('r', '*')
        AND pg_get_expr(p.polqual, p.polrelid) NOT ILIKE '%auth.uid()%'
        AND EXISTS (
          SELECT 1 FROM unnest(p.polroles) r
          WHERE r = 0 OR pg_get_userbyid(r) IN ('anon', 'authenticated')
        )
    ), ARRAY[]::text[])
  FROM pg_publication_tables pt
  JOIN pg_class c ON c.relname = pt.tablename
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = pt.schemaname
  LEFT JOIN public.realtime_guard_allowlist al ON al.table_name = pt.tablename
  WHERE pt.pubname = 'supabase_realtime'
    AND pt.schemaname = 'public'
    AND (
      auth.role() IN ('service_role', 'postgres', 'supabase_admin')
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  ORDER BY pt.tablename;
$$;

REVOKE ALL ON FUNCTION public.realtime_publication_audit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.realtime_publication_audit() TO authenticated, service_role;

-- Internal upsert helper; only ever called from the SECURITY DEFINER checker.
CREATE OR REPLACE FUNCTION public.raise_realtime_alert(
  _check text, _target text, _sev text, _msg text, _detail jsonb
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  INSERT INTO public.realtime_guard_alerts (check_name, target, severity, message, detail)
  VALUES (_check, _target, _sev, _msg, _detail)
  ON CONFLICT (check_name, target) WHERE status = 'open'
  DO UPDATE SET severity = EXCLUDED.severity,
                message  = EXCLUDED.message,
                detail   = EXCLUDED.detail,
                updated_at = now();
$$;

REVOKE ALL ON FUNCTION public.raise_realtime_alert(text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.raise_realtime_alert(text, text, text, text, jsonb) TO service_role;

-- Evaluates the audit, opening/resolving alerts. Run by cron and on demand.
CREATE OR REPLACE FUNCTION public.check_realtime_guard()
RETURNS TABLE(opened integer, resolved integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rec record;
  n_open integer := 0;
  seen text[] := ARRAY[]::text[];
BEGIN
  IF auth.role() IS NOT NULL
     AND auth.role() NOT IN ('service_role', 'postgres', 'supabase_admin')
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  FOR rec IN SELECT * FROM public.realtime_publication_audit() LOOP
    -- 1. Table broadcasting without being approved for Realtime.
    IF NOT rec.approved THEN
      PERFORM public.raise_realtime_alert(
        'unapproved_publication_member', rec.table_name, 'critical',
        format('%s is published to supabase_realtime but is not on the Realtime allowlist', rec.table_name),
        jsonb_build_object('table', rec.table_name)
      );
      seen := seen || ('unapproved_publication_member|' || rec.table_name);
      n_open := n_open + 1;
    END IF;

    -- 2. Published table with RLS off broadcasts every row to every subscriber.
    IF NOT rec.rls_enabled THEN
      PERFORM public.raise_realtime_alert(
        'published_table_rls_disabled', rec.table_name, 'critical',
        format('Row level security is disabled on published table %s', rec.table_name),
        jsonb_build_object('table', rec.table_name)
      );
      seen := seen || ('published_table_rls_disabled|' || rec.table_name);
      n_open := n_open + 1;
    END IF;

    -- 3. A SELECT policy on a private table that is not scoped to auth.uid()
    --    is exactly how pending connection rows would start reaching bystanders.
    IF rec.sensitivity = 'private' AND array_length(rec.unscoped_select_policies, 1) > 0 THEN
      PERFORM public.raise_realtime_alert(
        'unscoped_select_policy', rec.table_name, 'critical',
        format('Published private table %s has SELECT policies not scoped to auth.uid(): %s',
               rec.table_name, array_to_string(rec.unscoped_select_policies, ', ')),
        jsonb_build_object('table', rec.table_name, 'policies', rec.unscoped_select_policies)
      );
      seen := seen || ('unscoped_select_policy|' || rec.table_name);
      n_open := n_open + 1;
    END IF;

    -- 4. REPLICA IDENTITY FULL ships the whole old row on UPDATE/DELETE, and
    --    delete payloads cannot be RLS-filtered by Realtime.
    IF rec.sensitivity = 'private' AND rec.replica_identity = 'full' THEN
      PERFORM public.raise_realtime_alert(
        'replica_identity_full', rec.table_name, 'warning',
        format('%s uses REPLICA IDENTITY FULL, so update/delete payloads carry every column of the old row',
               rec.table_name),
        jsonb_build_object('table', rec.table_name, 'replica_identity', rec.replica_identity)
      );
      seen := seen || ('replica_identity_full|' || rec.table_name);
      n_open := n_open + 1;
    END IF;
  END LOOP;

  -- Anything previously open that no longer reproduces is resolved.
  UPDATE public.realtime_guard_alerts a
  SET status = 'resolved', resolved_at = now(), updated_at = now()
  WHERE a.status = 'open'
    AND NOT ((a.check_name || '|' || a.target) = ANY (seen));
  GET DIAGNOSTICS resolved = ROW_COUNT;

  opened := n_open;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.check_realtime_guard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_realtime_guard() TO authenticated, service_role;

-- Run every 15 minutes so a regression surfaces within one cron window.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('realtime-guard-check')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'realtime-guard-check');

    PERFORM cron.schedule(
      'realtime-guard-check',
      '*/15 * * * *',
      $cron$SELECT public.check_realtime_guard();$cron$
    );
  END IF;
END $$;

-- Seed the current state so the panel is populated immediately.
SELECT public.check_realtime_guard();