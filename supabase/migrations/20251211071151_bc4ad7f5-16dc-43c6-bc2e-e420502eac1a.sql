-- Fix security issues for database views

-- 1. Recreate profiles_secure view with proper security
DROP VIEW IF EXISTS public.profiles_secure;
CREATE OR REPLACE VIEW public.profiles_secure WITH (security_invoker = true) AS
SELECT 
  p.id,
  p.created_at,
  p.updated_at,
  p.onboarding_completed,
  p.discoverable,
  -- Only show sensitive fields to owner or accepted connections respecting privacy settings
  CASE 
    WHEN p.id = auth.uid() THEN p.birthdate
    WHEN EXISTS (
      SELECT 1 FROM user_connections 
      WHERE status = 'accepted' 
      AND ((user_id = auth.uid() AND friend_id = p.id) OR (friend_id = auth.uid() AND user_id = p.id))
    ) AND COALESCE((p.privacy_settings->>'show_birthdate')::boolean, false) THEN p.birthdate
    ELSE NULL
  END as birthdate,
  CASE 
    WHEN p.id = auth.uid() THEN p.bio
    WHEN EXISTS (
      SELECT 1 FROM user_connections 
      WHERE status = 'accepted' 
      AND ((user_id = auth.uid() AND friend_id = p.id) OR (friend_id = auth.uid() AND user_id = p.id))
    ) AND COALESCE((p.privacy_settings->>'show_bio')::boolean, true) THEN p.bio
    ELSE NULL
  END as bio,
  CASE 
    WHEN p.id = auth.uid() THEN p.gender
    WHEN EXISTS (
      SELECT 1 FROM user_connections 
      WHERE status = 'accepted' 
      AND ((user_id = auth.uid() AND friend_id = p.id) OR (friend_id = auth.uid() AND user_id = p.id))
    ) AND COALESCE((p.privacy_settings->>'show_gender')::boolean, true) THEN p.gender
    ELSE NULL
  END as gender,
  CASE 
    WHEN p.id = auth.uid() THEN p.pronouns
    WHEN EXISTS (
      SELECT 1 FROM user_connections 
      WHERE status = 'accepted' 
      AND ((user_id = auth.uid() AND friend_id = p.id) OR (friend_id = auth.uid() AND user_id = p.id))
    ) AND COALESCE((p.privacy_settings->>'show_pronouns')::boolean, true) THEN p.pronouns
    ELSE NULL
  END as pronouns,
  CASE 
    WHEN p.id = auth.uid() THEN p.instagram_url
    WHEN EXISTS (
      SELECT 1 FROM user_connections 
      WHERE status = 'accepted' 
      AND ((user_id = auth.uid() AND friend_id = p.id) OR (friend_id = auth.uid() AND user_id = p.id))
    ) AND COALESCE((p.privacy_settings->>'show_instagram')::boolean, true) THEN p.instagram_url
    ELSE NULL
  END as instagram_url,
  CASE 
    WHEN p.id = auth.uid() THEN p.twitter_url
    WHEN EXISTS (
      SELECT 1 FROM user_connections 
      WHERE status = 'accepted' 
      AND ((user_id = auth.uid() AND friend_id = p.id) OR (friend_id = auth.uid() AND user_id = p.id))
    ) AND COALESCE((p.privacy_settings->>'show_twitter')::boolean, true) THEN p.twitter_url
    ELSE NULL
  END as twitter_url,
  CASE 
    WHEN p.id = auth.uid() THEN p.facebook_url
    WHEN EXISTS (
      SELECT 1 FROM user_connections 
      WHERE status = 'accepted' 
      AND ((user_id = auth.uid() AND friend_id = p.id) OR (friend_id = auth.uid() AND user_id = p.id))
    ) AND COALESCE((p.privacy_settings->>'show_facebook')::boolean, true) THEN p.facebook_url
    ELSE NULL
  END as facebook_url,
  CASE 
    WHEN p.id = auth.uid() THEN p.linkedin_url
    WHEN EXISTS (
      SELECT 1 FROM user_connections 
      WHERE status = 'accepted' 
      AND ((user_id = auth.uid() AND friend_id = p.id) OR (friend_id = auth.uid() AND user_id = p.id))
    ) AND COALESCE((p.privacy_settings->>'show_linkedin')::boolean, true) THEN p.linkedin_url
    ELSE NULL
  END as linkedin_url,
  CASE 
    WHEN p.id = auth.uid() THEN p.tiktok_url
    WHEN EXISTS (
      SELECT 1 FROM user_connections 
      WHERE status = 'accepted' 
      AND ((user_id = auth.uid() AND friend_id = p.id) OR (friend_id = auth.uid() AND user_id = p.id))
    ) AND COALESCE((p.privacy_settings->>'show_tiktok')::boolean, true) THEN p.tiktok_url
    ELSE NULL
  END as tiktok_url,
  -- Always visible fields
  p.display_name,
  p.avatar_url
FROM public.profiles p
WHERE 
  -- User can see their own profile
  p.id = auth.uid()
  -- Or they have an accepted connection
  OR EXISTS (
    SELECT 1 FROM user_connections 
    WHERE status = 'accepted' 
    AND ((user_id = auth.uid() AND friend_id = p.id) OR (friend_id = auth.uid() AND user_id = p.id))
  );

-- Revoke all access and grant only to authenticated
REVOKE ALL ON public.profiles_secure FROM anon, public;
GRANT SELECT ON public.profiles_secure TO authenticated;

-- 2. Recreate discoverable_profiles view with authentication requirement
DROP VIEW IF EXISTS public.discoverable_profiles;
CREATE OR REPLACE VIEW public.discoverable_profiles WITH (security_invoker = true) AS
SELECT 
  p.id,
  p.display_name,
  p.avatar_url
FROM public.profiles p
WHERE 
  -- Only authenticated users can see discoverable profiles
  auth.uid() IS NOT NULL
  -- Exclude current user
  AND p.id != auth.uid()
  -- Only show users who are discoverable
  AND COALESCE(p.discoverable, true) = true
  -- Exclude users with existing connections
  AND NOT EXISTS (
    SELECT 1 FROM user_connections 
    WHERE (user_id = auth.uid() AND friend_id = p.id) 
    OR (friend_id = auth.uid() AND user_id = p.id)
  );

-- Revoke all access and grant only to authenticated
REVOKE ALL ON public.discoverable_profiles FROM anon, public;
GRANT SELECT ON public.discoverable_profiles TO authenticated;

-- 3. Recreate venue_reviews_public view with authentication requirement
DROP VIEW IF EXISTS public.venue_reviews_public;
CREATE OR REPLACE VIEW public.venue_reviews_public WITH (security_invoker = true) AS
SELECT 
  vr.id,
  vr.rating,
  vr.review_text,
  vr.venue_id,
  vr.venue_name,
  vr.created_at,
  vr.updated_at
FROM public.venue_reviews vr
WHERE auth.uid() IS NOT NULL;

-- Revoke all access and grant only to authenticated
REVOKE ALL ON public.venue_reviews_public FROM anon, public;
GRANT SELECT ON public.venue_reviews_public TO authenticated;