
-- admin_user_directory / admin_user_sync_status are invoked through the
-- service-role client, where auth.uid() is NULL, so the has_role gate
-- silently filtered out every row. Take the caller's id explicitly instead.

CREATE OR REPLACE FUNCTION public.admin_user_directory(_user_id uuid)
RETURNS TABLE(
  id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  display_name text,
  onboarding_completed boolean,
  has_profile boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    u.id,
    u.email::text,
    u.created_at,
    u.last_sign_in_at,
    u.email_confirmed_at,
    p.display_name,
    COALESCE(p.onboarding_completed, false),
    (p.id IS NOT NULL)
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE public.has_role(_user_id, 'admin'::app_role)
  ORDER BY u.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.admin_user_sync_status(_user_id uuid)
RETURNS TABLE(
  auth_users bigint,
  profiles bigint,
  preferences bigint,
  missing_profiles bigint,
  missing_preferences bigint,
  orphan_profiles bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    (SELECT count(*) FROM auth.users),
    (SELECT count(*) FROM public.profiles),
    (SELECT count(*) FROM public.user_preferences),
    (SELECT count(*) FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id WHERE p.id IS NULL),
    (SELECT count(*) FROM auth.users u LEFT JOIN public.user_preferences up ON up.user_id = u.id WHERE up.user_id IS NULL),
    (SELECT count(*) FROM public.profiles p LEFT JOIN auth.users u ON u.id = p.id WHERE u.id IS NULL)
  WHERE public.has_role(_user_id, 'admin'::app_role);
$$;

-- Drop the old zero-arg variants so only the parameterized ones remain.
DROP FUNCTION IF EXISTS public.admin_user_directory();
DROP FUNCTION IF EXISTS public.admin_user_sync_status();

REVOKE ALL ON FUNCTION public.admin_user_directory(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_user_sync_status(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_directory(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_user_sync_status(uuid) TO service_role;
