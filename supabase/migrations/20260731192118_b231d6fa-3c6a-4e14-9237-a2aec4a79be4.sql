-- 1. Backfill any accounts missing a profile / preferences row
INSERT INTO public.profiles (id, display_name)
SELECT u.id, COALESCE(u.raw_user_meta_data->>'display_name', u.email)
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_preferences (user_id)
SELECT u.id
FROM auth.users u
LEFT JOIN public.user_preferences up ON up.user_id = u.id
WHERE up.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

UPDATE public.profiles p
SET display_name = COALESCE(u.raw_user_meta_data->>'display_name', u.email),
    updated_at = now()
FROM auth.users u
WHERE u.id = p.id
  AND (p.display_name IS NULL OR btrim(p.display_name) = '');

-- 2. Admin-only directory: authoritative account list joined to profile data
CREATE OR REPLACE FUNCTION public.admin_user_directory()
RETURNS TABLE (
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
SET search_path = public
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
  WHERE public.has_role(auth.uid(), 'admin'::app_role)
  ORDER BY u.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.admin_user_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_user_directory() TO authenticated;

-- 3. Admin-only sync summary so drift is visible in the dashboard
CREATE OR REPLACE FUNCTION public.admin_user_sync_status()
RETURNS TABLE (
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
SET search_path = public
AS $$
  SELECT
    (SELECT count(*) FROM auth.users),
    (SELECT count(*) FROM public.profiles),
    (SELECT count(*) FROM public.user_preferences),
    (SELECT count(*) FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id WHERE p.id IS NULL),
    (SELECT count(*) FROM auth.users u LEFT JOIN public.user_preferences up ON up.user_id = u.id WHERE up.user_id IS NULL),
    (SELECT count(*) FROM public.profiles p LEFT JOIN auth.users u ON u.id = p.id WHERE u.id IS NULL)
  WHERE public.has_role(auth.uid(), 'admin'::app_role);
$$;

REVOKE ALL ON FUNCTION public.admin_user_sync_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_user_sync_status() TO authenticated;

-- 4. Make sure the signup trigger that creates profiles/preferences is bound
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();