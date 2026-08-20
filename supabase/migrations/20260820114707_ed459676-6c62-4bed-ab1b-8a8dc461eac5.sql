CREATE OR REPLACE FUNCTION public.check_connection_rate_limit(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  request_count integer;
  rate_limit integer := 10;
  time_window interval := '1 hour';
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND _user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT COUNT(*) INTO request_count
  FROM public.user_connections
  WHERE user_id = _user_id
    AND created_at > NOW() - time_window;

  RETURN request_count < rate_limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.check_connection_rate_limit(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_connection_rate_limit(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_connection_rate_limit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_connection_rate_limit(uuid) TO service_role;