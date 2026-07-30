-- Drop and recreate the profiles_secure view with security_invoker enabled
DROP VIEW IF EXISTS public.profiles_secure;

CREATE OR REPLACE VIEW public.profiles_secure
WITH (security_invoker = true)
AS
SELECT 
    id,
    display_name,
    avatar_url,
    created_at,
    updated_at,
    onboarding_completed,
    discoverable,
    CASE
        WHEN COALESCE((privacy_settings ->> 'show_bio'::text)::boolean, true) THEN bio
        ELSE NULL::text
    END AS bio,
    CASE
        WHEN COALESCE((privacy_settings ->> 'show_birthdate'::text)::boolean, false) THEN birthdate
        ELSE NULL::date
    END AS birthdate,
    CASE
        WHEN COALESCE((privacy_settings ->> 'show_gender'::text)::boolean, true) THEN gender
        ELSE NULL::text
    END AS gender,
    CASE
        WHEN COALESCE((privacy_settings ->> 'show_pronouns'::text)::boolean, true) THEN pronouns
        ELSE NULL::text
    END AS pronouns,
    CASE
        WHEN COALESCE((privacy_settings ->> 'show_instagram'::text)::boolean, true) THEN instagram_url
        ELSE NULL::text
    END AS instagram_url,
    CASE
        WHEN COALESCE((privacy_settings ->> 'show_twitter'::text)::boolean, true) THEN twitter_url
        ELSE NULL::text
    END AS twitter_url,
    CASE
        WHEN COALESCE((privacy_settings ->> 'show_facebook'::text)::boolean, true) THEN facebook_url
        ELSE NULL::text
    END AS facebook_url,
    CASE
        WHEN COALESCE((privacy_settings ->> 'show_linkedin'::text)::boolean, true) THEN linkedin_url
        ELSE NULL::text
    END AS linkedin_url,
    CASE
        WHEN COALESCE((privacy_settings ->> 'show_tiktok'::text)::boolean, true) THEN tiktok_url
        ELSE NULL::text
    END AS tiktok_url
FROM profiles p
WHERE id = auth.uid() 
   OR EXISTS (
        SELECT 1
        FROM user_connections uc
        WHERE uc.status = 'accepted'::text 
          AND ((uc.user_id = auth.uid() AND uc.friend_id = p.id) 
            OR (uc.friend_id = auth.uid() AND uc.user_id = p.id))
    );

-- Grant select permission to authenticated users only
GRANT SELECT ON public.profiles_secure TO authenticated;
REVOKE SELECT ON public.profiles_secure FROM anon;