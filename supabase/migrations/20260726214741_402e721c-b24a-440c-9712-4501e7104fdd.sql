REVOKE ALL ON FUNCTION public.ensure_user_preferences() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_user_preferences() TO service_role;