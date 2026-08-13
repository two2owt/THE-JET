-- 1. Definer routines that keep the existing privacy gating
CREATE OR REPLACE FUNCTION public.profiles_secure_rows()
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  onboarding_completed boolean,
  discoverable boolean,
  birthdate date,
  bio text,
  gender text,
  pronouns text,
  instagram_url text,
  twitter_url text,
  facebook_url text,
  linkedin_url text,
  tiktok_url text,
  display_name text,
  avatar_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH conn AS (
    SELECT CASE WHEN uc.user_id = auth.uid() THEN uc.friend_id ELSE uc.user_id END AS other_id
    FROM public.user_connections uc
    WHERE uc.status = 'accepted'
      AND (uc.user_id = auth.uid() OR uc.friend_id = auth.uid())
  )
  SELECT
    p.id,
    p.created_at,
    p.updated_at,
    p.onboarding_completed,
    p.discoverable,
    CASE WHEN p.id = auth.uid() THEN p.birthdate
         WHEN COALESCE((p.privacy_settings->>'show_birthdate')::boolean, false) THEN p.birthdate
         ELSE NULL END,
    CASE WHEN p.id = auth.uid() THEN p.bio
         WHEN COALESCE((p.privacy_settings->>'show_bio')::boolean, true) THEN p.bio
         ELSE NULL END,
    CASE WHEN p.id = auth.uid() THEN p.gender
         WHEN COALESCE((p.privacy_settings->>'show_gender')::boolean, true) THEN p.gender
         ELSE NULL END,
    CASE WHEN p.id = auth.uid() THEN p.pronouns
         WHEN COALESCE((p.privacy_settings->>'show_pronouns')::boolean, true) THEN p.pronouns
         ELSE NULL END,
    CASE WHEN p.id = auth.uid() THEN p.instagram_url
         WHEN COALESCE((p.privacy_settings->>'show_instagram')::boolean, true) THEN p.instagram_url
         ELSE NULL END,
    CASE WHEN p.id = auth.uid() THEN p.twitter_url
         WHEN COALESCE((p.privacy_settings->>'show_twitter')::boolean, true) THEN p.twitter_url
         ELSE NULL END,
    CASE WHEN p.id = auth.uid() THEN p.facebook_url
         WHEN COALESCE((p.privacy_settings->>'show_facebook')::boolean, true) THEN p.facebook_url
         ELSE NULL END,
    CASE WHEN p.id = auth.uid() THEN p.linkedin_url
         WHEN COALESCE((p.privacy_settings->>'show_linkedin')::boolean, true) THEN p.linkedin_url
         ELSE NULL END,
    CASE WHEN p.id = auth.uid() THEN p.tiktok_url
         WHEN COALESCE((p.privacy_settings->>'show_tiktok')::boolean, true) THEN p.tiktok_url
         ELSE NULL END,
    p.display_name,
    p.avatar_url
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND (p.id = auth.uid() OR p.id IN (SELECT other_id FROM conn));
$$;

REVOKE EXECUTE ON FUNCTION public.profiles_secure_rows() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profiles_secure_rows() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.discoverable_profiles_rows()
RETURNS TABLE (
  id uuid,
  display_name text,
  avatar_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.display_name, p.avatar_url
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND p.id <> auth.uid()
    AND p.discoverable IS DISTINCT FROM false;
$$;

REVOKE EXECUTE ON FUNCTION public.discoverable_profiles_rows() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.discoverable_profiles_rows() TO authenticated, service_role;

-- 2. Recreate the views as security_invoker views over those routines
DROP VIEW IF EXISTS public.profiles_secure;
CREATE VIEW public.profiles_secure WITH (security_invoker = on) AS
  SELECT * FROM public.profiles_secure_rows();

DROP VIEW IF EXISTS public.discoverable_profiles;
CREATE VIEW public.discoverable_profiles WITH (security_invoker = on) AS
  SELECT * FROM public.discoverable_profiles_rows();

REVOKE ALL ON public.profiles_secure FROM PUBLIC, anon;
REVOKE ALL ON public.discoverable_profiles FROM PUBLIC, anon;
GRANT SELECT ON public.profiles_secure TO authenticated, service_role;
GRANT SELECT ON public.discoverable_profiles TO authenticated, service_role;