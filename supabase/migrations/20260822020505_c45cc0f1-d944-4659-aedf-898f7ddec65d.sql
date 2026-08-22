-- Downgrade the connection rate-limit helper to SECURITY INVOKER: RLS on
-- user_connections already scopes rows to the caller, so elevated privileges
-- are unnecessary.
CREATE OR REPLACE FUNCTION public.check_connection_rate_limit(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY INVOKER
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

REVOKE ALL ON FUNCTION public.check_connection_rate_limit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_connection_rate_limit(uuid) TO authenticated, service_role;

-- Re-assert least privilege on the remaining SECURITY DEFINER helpers that the
-- app legitimately calls. Each enforces its own admin/owner authorization.
REVOKE ALL ON FUNCTION public.admin_user_directory() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_user_sync_status() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_retention_schedule() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.display_name_available(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_push_subscription(text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.profiles_visible() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_user_directory() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_user_sync_status() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_retention_schedule() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.display_name_available(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_push_subscription(text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.profiles_visible() TO authenticated, service_role;