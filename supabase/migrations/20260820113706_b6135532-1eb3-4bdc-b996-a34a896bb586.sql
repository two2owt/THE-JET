-- 1. Remove unmasked base-table access for accepted connections.
--    All other-user reads must go through profiles_secure / discoverable_profiles,
--    which apply per-field privacy_settings masking via profiles_visible().
DROP POLICY IF EXISTS "Users can view connected profiles with privacy" ON public.profiles;

-- 2. Preserve display-name uniqueness checks without exposing other profiles.
CREATE OR REPLACE FUNCTION public.display_name_available(_name text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE lower(p.display_name) = lower(btrim(_name))
         AND p.id <> auth.uid()
     );
$$;

REVOKE ALL ON FUNCTION public.display_name_available(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.display_name_available(text) TO authenticated, service_role;

-- 3. has_role is executable by signed-in users; scope it to the caller so it
--    cannot be used to probe other accounts' roles. Trusted backend contexts
--    (service_role / superuser cron jobs) keep full lookup ability.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _user_id IS DISTINCT FROM auth.uid()
         AND COALESCE(auth.role(), current_user) NOT IN ('service_role', 'postgres', 'supabase_admin')
    THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = _role
    )
  END
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;