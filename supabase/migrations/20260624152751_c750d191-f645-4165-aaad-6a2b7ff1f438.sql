-- Remove user_favorites from realtime publication (sensitive content not intended for realtime)
ALTER PUBLICATION supabase_realtime DROP TABLE public.user_favorites;

-- Defensive revoke of EXECUTE from PUBLIC and anon for all SECURITY DEFINER functions in public schema
-- Re-grant only to roles that legitimately need them (authenticated for RLS helper functions; service_role for triggers/internal).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon', r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role', r.proname, r.args);
  END LOOP;
END $$;

-- Re-grant EXECUTE to authenticated for RLS helpers used in policies
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_profile_field(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_connection_rate_limit(uuid) TO authenticated;