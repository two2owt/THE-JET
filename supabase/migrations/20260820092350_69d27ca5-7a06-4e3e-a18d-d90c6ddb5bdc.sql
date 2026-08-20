
-- Signed-in users can view profiles that are discoverable (default: discoverable)
DROP POLICY IF EXISTS "Users can view discoverable profiles" ON public.profiles;
CREATE POLICY "Users can view discoverable profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (COALESCE(discoverable, true));

-- Default discoverable for any legacy null rows
UPDATE public.profiles SET discoverable = true WHERE discoverable IS NULL;
ALTER TABLE public.profiles ALTER COLUMN discoverable SET DEFAULT true;

-- Field-level visibility: allow connected OR discoverable viewers
CREATE OR REPLACE FUNCTION public.can_view_profile_field(_profile_id uuid, _viewer_id uuid, _field_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _privacy_settings jsonb;
  _visible boolean;
BEGIN
  IF _profile_id = _viewer_id THEN
    RETURN true;
  END IF;

  SELECT (
    COALESCE(p.discoverable, true)
    OR EXISTS (
      SELECT 1 FROM user_connections
      WHERE status = 'accepted'
        AND ((user_id = _viewer_id AND friend_id = _profile_id)
          OR (friend_id = _viewer_id AND user_id = _profile_id))
    )
  ), p.privacy_settings
  INTO _visible, _privacy_settings
  FROM profiles p WHERE p.id = _profile_id;

  IF NOT COALESCE(_visible, false) THEN
    RETURN false;
  END IF;

  IF _privacy_settings IS NULL THEN
    RETURN true;
  END IF;

  RETURN COALESCE((_privacy_settings->>_field_name)::boolean, true);
END;
$function$;

-- Rebuild the secure profile view to include discoverable (non-connected) viewers
DROP VIEW IF EXISTS public.profiles_secure;
CREATE VIEW public.profiles_secure
WITH (security_invoker = on) AS
SELECT
  p.id,
  p.created_at,
  p.updated_at,
  p.onboarding_completed,
  p.discoverable,
  CASE WHEN public.can_view_profile_field(p.id, auth.uid(), 'show_birthdate')
       AND (p.id = auth.uid() OR COALESCE((p.privacy_settings->>'show_birthdate')::boolean, false))
       THEN p.birthdate END AS birthdate,
  CASE WHEN public.can_view_profile_field(p.id, auth.uid(), 'show_bio') THEN p.bio END AS bio,
  CASE WHEN public.can_view_profile_field(p.id, auth.uid(), 'show_gender') THEN p.gender END AS gender,
  CASE WHEN public.can_view_profile_field(p.id, auth.uid(), 'show_pronouns') THEN p.pronouns END AS pronouns,
  CASE WHEN public.can_view_profile_field(p.id, auth.uid(), 'show_instagram') THEN p.instagram_url END AS instagram_url,
  CASE WHEN public.can_view_profile_field(p.id, auth.uid(), 'show_twitter') THEN p.twitter_url END AS twitter_url,
  CASE WHEN public.can_view_profile_field(p.id, auth.uid(), 'show_facebook') THEN p.facebook_url END AS facebook_url,
  CASE WHEN public.can_view_profile_field(p.id, auth.uid(), 'show_linkedin') THEN p.linkedin_url END AS linkedin_url,
  CASE WHEN public.can_view_profile_field(p.id, auth.uid(), 'show_tiktok') THEN p.tiktok_url END AS tiktok_url,
  p.display_name,
  p.avatar_url
FROM public.profiles p;

GRANT SELECT ON public.profiles_secure TO authenticated;
REVOKE ALL ON public.profiles_secure FROM anon;
