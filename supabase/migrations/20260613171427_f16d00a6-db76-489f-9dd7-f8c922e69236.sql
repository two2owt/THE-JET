
-- 1) Restrict user_roles INSERT to service_role only (prevent admin self-escalation via API)
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;

CREATE POLICY "Service role manages role inserts"
ON public.user_roles
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Service role manages role deletes"
ON public.user_roles
FOR DELETE
TO service_role
USING (true);

-- 2) Revoke EXECUTE from PUBLIC/anon on SECURITY DEFINER helpers; keep only what is needed
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_profile_field(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_connection_rate_limit(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.obfuscate_coordinates(numeric, numeric) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_profile_field(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_connection_rate_limit(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obfuscate_coordinates(numeric, numeric) TO service_role;
