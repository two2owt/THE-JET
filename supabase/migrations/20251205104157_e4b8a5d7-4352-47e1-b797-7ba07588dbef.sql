-- Add discoverable column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS discoverable boolean DEFAULT true;

-- Update privacy_settings default to include show_discoverable
ALTER TABLE public.profiles 
ALTER COLUMN privacy_settings 
SET DEFAULT '{"show_bio": true, "show_gender": true, "show_tiktok": true, "show_twitter": true, "show_facebook": true, "show_linkedin": true, "show_pronouns": true, "show_birthdate": false, "show_instagram": true, "show_discoverable": true}'::jsonb;

-- Drop and recreate the profiles_secure view with discoverable filter and SECURITY INVOKER
DROP VIEW IF EXISTS public.profiles_secure;

CREATE OR REPLACE VIEW public.profiles_secure 
WITH (security_invoker = true) AS
SELECT 
  p.id,
  p.display_name,
  p.avatar_url,
  p.created_at,
  p.updated_at,
  p.onboarding_completed,
  p.discoverable,
  -- Apply privacy filters for sensitive fields
  CASE WHEN COALESCE((p.privacy_settings->>'show_bio')::boolean, true) THEN p.bio ELSE NULL END as bio,
  CASE WHEN COALESCE((p.privacy_settings->>'show_birthdate')::boolean, false) THEN p.birthdate ELSE NULL END as birthdate,
  CASE WHEN COALESCE((p.privacy_settings->>'show_gender')::boolean, true) THEN p.gender ELSE NULL END as gender,
  CASE WHEN COALESCE((p.privacy_settings->>'show_pronouns')::boolean, true) THEN p.pronouns ELSE NULL END as pronouns,
  CASE WHEN COALESCE((p.privacy_settings->>'show_instagram')::boolean, true) THEN p.instagram_url ELSE NULL END as instagram_url,
  CASE WHEN COALESCE((p.privacy_settings->>'show_twitter')::boolean, true) THEN p.twitter_url ELSE NULL END as twitter_url,
  CASE WHEN COALESCE((p.privacy_settings->>'show_facebook')::boolean, true) THEN p.facebook_url ELSE NULL END as facebook_url,
  CASE WHEN COALESCE((p.privacy_settings->>'show_linkedin')::boolean, true) THEN p.linkedin_url ELSE NULL END as linkedin_url,
  CASE WHEN COALESCE((p.privacy_settings->>'show_tiktok')::boolean, true) THEN p.tiktok_url ELSE NULL END as tiktok_url
FROM public.profiles p
WHERE 
  -- User can always see their own profile
  p.id = auth.uid()
  OR 
  -- Or they must have an accepted connection
  EXISTS (
    SELECT 1 FROM public.user_connections uc
    WHERE uc.status = 'accepted'
    AND ((uc.user_id = auth.uid() AND uc.friend_id = p.id) 
         OR (uc.friend_id = auth.uid() AND uc.user_id = p.id))
  );

-- Create a separate view for discoverable profiles (for Discover People feature)
CREATE OR REPLACE VIEW public.discoverable_profiles
WITH (security_invoker = true) AS
SELECT 
  p.id,
  p.display_name,
  p.avatar_url
FROM public.profiles p
WHERE 
  p.discoverable = true
  AND p.id != auth.uid()
  -- Exclude users already connected
  AND NOT EXISTS (
    SELECT 1 FROM public.user_connections uc
    WHERE uc.status = 'accepted'
    AND ((uc.user_id = auth.uid() AND uc.friend_id = p.id) 
         OR (uc.friend_id = auth.uid() AND uc.user_id = p.id))
  )
  -- Exclude pending requests
  AND NOT EXISTS (
    SELECT 1 FROM public.user_connections uc
    WHERE uc.status = 'pending'
    AND ((uc.user_id = auth.uid() AND uc.friend_id = p.id) 
         OR (uc.friend_id = auth.uid() AND uc.user_id = p.id))
  );