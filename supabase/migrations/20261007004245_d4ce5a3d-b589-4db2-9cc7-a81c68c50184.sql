
REVOKE ALL ON FUNCTION public.admin_user_directory(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_user_sync_status(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_user_directory(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_user_sync_status(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_directory(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_user_sync_status(uuid) TO service_role;
