REVOKE ALL ON FUNCTION public.bump_map_data_pulse() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_map_data_pulse() TO service_role;