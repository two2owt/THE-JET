-- Shared per-field privacy default (birthdate is opt-in, everything else opt-out)
CREATE OR REPLACE FUNCTION public.privacy_field_default(_field_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE WHEN _field_name = 'show_birthdate' THEN false ELSE true END;
$$;

CREATE OR REPLACE FUNCTION public.privacy_allows(_privacy_settings jsonb, _field_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (_privacy_settings ->> _field_name)::boolean,
    public.privacy_field_default(_field_name)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.privacy_field_default(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.privacy_allows(jsonb, text) FROM PUBLIC, anon, authenticated;

-- Connected-users profile reader: every exposed field now honors the owner's toggles
CREATE OR REPLACE FUNCTION public.profiles_secure_rows()
RETURNS TABLE(id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, onboarding_completed boolean, discoverable boolean, birthdate date, bio text, gender text, pronouns text, instagram_url text, twitter_url text, facebook_url text, linkedin_url text, tiktok_url text, display_name text, avatar_url text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    CASE WHEN p.id = auth.uid() THEN p.discoverable
         ELSE p.discoverable AND public.privacy_allows(p.privacy_settings, 'show_discoverable') END,
    CASE WHEN p.id = auth.uid() THEN p.birthdate
         WHEN public.privacy_allows(p.privacy_settings, 'show_birthdate') THEN p.birthdate END,
    CASE WHEN p.id = auth.uid() THEN p.bio
         WHEN public.privacy_allows(p.privacy_settings, 'show_bio') THEN p.bio END,
    CASE WHEN p.id = auth.uid() THEN p.gender
         WHEN public.privacy_allows(p.privacy_settings, 'show_gender') THEN p.gender END,
    CASE WHEN p.id = auth.uid() THEN p.pronouns
         WHEN public.privacy_allows(p.privacy_settings, 'show_pronouns') THEN p.pronouns END,
    CASE WHEN p.id = auth.uid() THEN p.instagram_url
         WHEN public.privacy_allows(p.privacy_settings, 'show_instagram') THEN p.instagram_url END,
    CASE WHEN p.id = auth.uid() THEN p.twitter_url
         WHEN public.privacy_allows(p.privacy_settings, 'show_twitter') THEN p.twitter_url END,
    CASE WHEN p.id = auth.uid() THEN p.facebook_url
         WHEN public.privacy_allows(p.privacy_settings, 'show_facebook') THEN p.facebook_url END,
    CASE WHEN p.id = auth.uid() THEN p.linkedin_url
         WHEN public.privacy_allows(p.privacy_settings, 'show_linkedin') THEN p.linkedin_url END,
    CASE WHEN p.id = auth.uid() THEN p.tiktok_url
         WHEN public.privacy_allows(p.privacy_settings, 'show_tiktok') THEN p.tiktok_url END,
    p.display_name,
    p.avatar_url
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND (p.id = auth.uid() OR p.id IN (SELECT other_id FROM conn));
$function$;

-- Field-level checker: use the same per-field defaults instead of blanket "true"
CREATE OR REPLACE FUNCTION public.can_view_profile_field(_profile_id uuid, _viewer_id uuid, _field_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _privacy_settings jsonb;
  _is_connected boolean;
BEGIN
  IF _profile_id = _viewer_id THEN
    RETURN true;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM user_connections
    WHERE status = 'accepted'
      AND ((user_id = _viewer_id AND friend_id = _profile_id)
        OR (friend_id = _viewer_id AND user_id = _profile_id))
  ) INTO _is_connected;

  IF NOT _is_connected THEN
    RETURN false;
  END IF;

  SELECT privacy_settings INTO _privacy_settings
  FROM profiles WHERE id = _profile_id;

  RETURN public.privacy_allows(_privacy_settings, _field_name);
END;
$function$;

-- Discovery listing must also respect the show_discoverable toggle, not just the column
CREATE OR REPLACE FUNCTION public.discoverable_profiles_rows()
RETURNS TABLE(id uuid, display_name text, avatar_url text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.id, p.display_name, p.avatar_url
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND p.id <> auth.uid()
    AND p.discoverable IS DISTINCT FROM false
    AND public.privacy_allows(p.privacy_settings, 'show_discoverable');
$function$;

REVOKE EXECUTE ON FUNCTION public.can_view_profile_field(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.profiles_secure_rows() FROM anon;
REVOKE EXECUTE ON FUNCTION public.discoverable_profiles_rows() FROM anon;
GRANT EXECUTE ON FUNCTION public.profiles_secure_rows() TO authenticated;
GRANT EXECUTE ON FUNCTION public.discoverable_profiles_rows() TO authenticated;