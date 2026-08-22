REVOKE ALL ON FUNCTION public.admin_user_directory() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_user_sync_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_retention_schedule() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_directory() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_user_sync_status() TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_retention_schedule() TO service_role;