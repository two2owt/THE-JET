ALTER TABLE public.realtime_guard_allowlist
  ADD COLUMN IF NOT EXISTS allow_replica_identity_full boolean NOT NULL DEFAULT false;

-- These four rely on server-side column filters (e.g. user_id=eq.<uid>) which
-- require the full old row on UPDATE/DELETE. Acknowledged, so the guard only
-- alerts when some *new* private table starts shipping full old rows.
UPDATE public.realtime_guard_allowlist
SET allow_replica_identity_full = true,
    note = note || ' — full old-row payloads acknowledged (needed for realtime column filters)'
WHERE table_name IN ('user_favorites', 'user_connections', 'search_history', 'venue_reviews')
  AND allow_replica_identity_full = false;

DROP FUNCTION IF EXISTS public.realtime_publication_audit();
CREATE FUNCTION public.realtime_publication_audit()
RETURNS TABLE(
  table_name text,
  approved boolean,
  sensitivity text,
  rls_enabled boolean,
  replica_identity text,
  replica_identity_acknowledged boolean,
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
    COALESCE(al.allow_replica_identity_full, false),
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
      COALESCE(auth.role(), current_user) IN ('service_role', 'postgres', 'supabase_admin')
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  ORDER BY pt.tablename;
$$;

REVOKE ALL ON FUNCTION public.realtime_publication_audit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.realtime_publication_audit() TO authenticated, service_role;

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
  IF COALESCE(auth.role(), current_user) NOT IN ('service_role', 'postgres', 'supabase_admin')
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  FOR rec IN SELECT * FROM public.realtime_publication_audit() LOOP
    IF NOT rec.approved THEN
      PERFORM public.raise_realtime_alert(
        'unapproved_publication_member', rec.table_name, 'critical',
        format('%s is published to supabase_realtime but is not on the Realtime allowlist', rec.table_name),
        jsonb_build_object('table', rec.table_name)
      );
      seen := seen || ('unapproved_publication_member|' || rec.table_name);
      n_open := n_open + 1;
    END IF;

    IF NOT rec.rls_enabled THEN
      PERFORM public.raise_realtime_alert(
        'published_table_rls_disabled', rec.table_name, 'critical',
        format('Row level security is disabled on published table %s', rec.table_name),
        jsonb_build_object('table', rec.table_name)
      );
      seen := seen || ('published_table_rls_disabled|' || rec.table_name);
      n_open := n_open + 1;
    END IF;

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

    IF rec.sensitivity = 'private'
       AND rec.replica_identity = 'full'
       AND NOT rec.replica_identity_acknowledged THEN
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

SELECT public.check_realtime_guard();