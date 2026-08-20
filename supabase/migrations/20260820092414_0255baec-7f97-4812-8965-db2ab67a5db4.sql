
DROP VIEW IF EXISTS public.profiles_secure;
CREATE VIEW public.profiles_secure
WITH (security_invoker = on) AS
WITH base AS (
  SELECT p.*,
    (p.id = auth.uid()) AS is_self,
    (
      COALESCE(p.discoverable, true)
      OR EXISTS (
        SELECT 1 FROM public.user_connections uc
        WHERE uc.status = 'accepted'
          AND ((uc.user_id = auth.uid() AND uc.friend_id = p.id)
            OR (uc.friend_id = auth.uid() AND uc.user_id = p.id))
      )
    ) AS can_view
  FROM public.profiles p
)
SELECT
  id, created_at, updated_at, onboarding_completed, discoverable,
  CASE WHEN is_self THEN birthdate
       WHEN can_view AND COALESCE((privacy_settings->>'show_birthdate')::boolean, false) THEN birthdate END AS birthdate,
  CASE WHEN is_self THEN bio
       WHEN can_view AND COALESCE((privacy_settings->>'show_bio')::boolean, true) THEN bio END AS bio,
  CASE WHEN is_self THEN gender
       WHEN can_view AND COALESCE((privacy_settings->>'show_gender')::boolean, true) THEN gender END AS gender,
  CASE WHEN is_self THEN pronouns
       WHEN can_view AND COALESCE((privacy_settings->>'show_pronouns')::boolean, true) THEN pronouns END AS pronouns,
  CASE WHEN is_self THEN instagram_url
       WHEN can_view AND COALESCE((privacy_settings->>'show_instagram')::boolean, true) THEN instagram_url END AS instagram_url,
  CASE WHEN is_self THEN twitter_url
       WHEN can_view AND COALESCE((privacy_settings->>'show_twitter')::boolean, true) THEN twitter_url END AS twitter_url,
  CASE WHEN is_self THEN facebook_url
       WHEN can_view AND COALESCE((privacy_settings->>'show_facebook')::boolean, true) THEN facebook_url END AS facebook_url,
  CASE WHEN is_self THEN linkedin_url
       WHEN can_view AND COALESCE((privacy_settings->>'show_linkedin')::boolean, true) THEN linkedin_url END AS linkedin_url,
  CASE WHEN is_self THEN tiktok_url
       WHEN can_view AND COALESCE((privacy_settings->>'show_tiktok')::boolean, true) THEN tiktok_url END AS tiktok_url,
  display_name,
  avatar_url
FROM base
WHERE is_self OR can_view;

GRANT SELECT ON public.profiles_secure TO authenticated;
REVOKE ALL ON public.profiles_secure FROM anon;
