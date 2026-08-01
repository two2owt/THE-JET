CREATE OR REPLACE FUNCTION public.cleanup_old_analytics_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.analytics_events
  WHERE event_name = 'sw_lifecycle'
    AND user_id IS NULL
    AND created_at < now() - INTERVAL '7 days';

  DELETE FROM public.analytics_events
  WHERE created_at < now() - INTERVAL '180 days';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_old_analytics_events() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_analytics_events() TO service_role;