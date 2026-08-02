DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_profile_field(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_connection_rate_limit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_user_emails() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_directory() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_sync_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_retention_schedule() TO authenticated;