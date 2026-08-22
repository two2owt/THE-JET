REVOKE EXECUTE ON FUNCTION public.check_realtime_guard() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.realtime_publication_audit() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.check_realtime_guard() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.realtime_publication_audit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_realtime_guard() TO service_role;
GRANT EXECUTE ON FUNCTION public.realtime_publication_audit() TO service_role;