-- 1) Backfill social handles from legacy profile URL columns before removing them.
INSERT INTO public.social_handles (user_id, platform, handle, url)
SELECT p.id, s.platform::public.social_platform,
       NULLIF(regexp_replace(regexp_replace(s.url, '^https?://[^/]+/', ''), '[/?].*$', ''), ''),
       s.url
FROM public.profiles p
CROSS JOIN LATERAL (
  VALUES ('instagram', p.instagram_url),
         ('twitter', p.twitter_url),
         ('facebook', p.facebook_url),
         ('linkedin', p.linkedin_url),
         ('tiktok', p.tiktok_url)
) AS s(platform, url)
WHERE s.url IS NOT NULL AND s.url <> ''
  AND NULLIF(regexp_replace(regexp_replace(s.url, '^https?://[^/]+/', ''), '[/?].*$', ''), '') IS NOT NULL
ON CONFLICT DO NOTHING;

-- 2) Drop the duplicate, fully unused social links table (superseded by social_handles).
DROP TRIGGER IF EXISTS update_profile_social_links_updated_at ON public.profile_social_links;
DROP TABLE IF EXISTS public.profile_social_links;

-- 3) Remove duplicate pulse trigger on profiles (two triggers ran the same function).
DROP TRIGGER IF EXISTS profiles_bump_pulse ON public.profiles;

-- 4) Drop dependents so the helper can be rebuilt, then drop legacy columns.
DROP POLICY IF EXISTS "Users can view social handles of visible profiles" ON public.social_handles;
DROP VIEW IF EXISTS public.profiles_secure;
DROP VIEW IF EXISTS public.discoverable_profiles;
DROP FUNCTION IF EXISTS public.profiles_visible();

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS instagram_url,
  DROP COLUMN IF EXISTS twitter_url,
  DROP COLUMN IF EXISTS facebook_url,
  DROP COLUMN IF EXISTS linkedin_url,
  DROP COLUMN IF EXISTS tiktok_url;

-- 5) Recreate the helper without the removed columns.
CREATE FUNCTION public.profiles_visible()
RETURNS TABLE(
  id uuid, created_at timestamptz, updated_at timestamptz,
  onboarding_completed boolean, discoverable boolean, birthdate date,
  bio text, gender text, pronouns text, display_name text, avatar_url text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT p.*,
      (p.id = auth.uid()) AS is_self,
      (
        COALESCE(p.discoverable, true)
        OR EXISTS (
          SELECT 1 FROM public.user_connections uc
          WHERE (uc.user_id = auth.uid() AND uc.friend_id = p.id)
             OR (uc.friend_id = auth.uid() AND uc.user_id = p.id)
        )
      ) AS can_view
    FROM public.profiles p
    WHERE auth.uid() IS NOT NULL
  )
  SELECT
    b.id,
    b.created_at,
    b.updated_at,
    b.onboarding_completed,
    b.discoverable,
    CASE WHEN b.is_self THEN b.birthdate
         WHEN COALESCE((b.privacy_settings->>'show_birthdate')::boolean, false) THEN b.birthdate END,
    CASE WHEN b.is_self THEN b.bio
         WHEN COALESCE((b.privacy_settings->>'show_bio')::boolean, true) THEN b.bio END,
    CASE WHEN b.is_self THEN b.gender
         WHEN COALESCE((b.privacy_settings->>'show_gender')::boolean, true) THEN b.gender END,
    CASE WHEN b.is_self THEN b.pronouns
         WHEN COALESCE((b.privacy_settings->>'show_pronouns')::boolean, true) THEN b.pronouns END,
    b.display_name,
    b.avatar_url
  FROM base b
  WHERE b.is_self OR b.can_view;
$function$;

REVOKE ALL ON FUNCTION public.profiles_visible() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.profiles_visible() FROM anon;
GRANT EXECUTE ON FUNCTION public.profiles_visible() TO authenticated, service_role;

-- 6) Recreate the dependent views and policy against the new signature.
CREATE VIEW public.profiles_secure WITH (security_invoker = on) AS
  SELECT id, created_at, updated_at, onboarding_completed, discoverable,
         birthdate, bio, gender, pronouns, display_name, avatar_url
  FROM public.profiles_visible();

CREATE VIEW public.discoverable_profiles WITH (security_invoker = on) AS
  SELECT id, display_name, avatar_url
  FROM public.profiles_visible()
  WHERE id <> auth.uid();

CREATE POLICY "Users can view social handles of visible profiles"
ON public.social_handles FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles_visible() v WHERE v.id = social_handles.user_id)
);