-- 1) Masked, privacy-respecting profile reader (definer, auth-gated)
CREATE OR REPLACE FUNCTION public.profiles_visible()
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
    CASE WHEN b.is_self THEN b.instagram_url
         WHEN COALESCE((b.privacy_settings->>'show_instagram')::boolean, true) THEN b.instagram_url END,
    CASE WHEN b.is_self THEN b.twitter_url
         WHEN COALESCE((b.privacy_settings->>'show_twitter')::boolean, true) THEN b.twitter_url END,
    CASE WHEN b.is_self THEN b.facebook_url
         WHEN COALESCE((b.privacy_settings->>'show_facebook')::boolean, true) THEN b.facebook_url END,
    CASE WHEN b.is_self THEN b.linkedin_url
         WHEN COALESCE((b.privacy_settings->>'show_linkedin')::boolean, true) THEN b.linkedin_url END,
    CASE WHEN b.is_self THEN b.tiktok_url
         WHEN COALESCE((b.privacy_settings->>'show_tiktok')::boolean, true) THEN b.tiktok_url END,
    b.display_name,
    b.avatar_url
  FROM base b
  WHERE b.is_self OR b.can_view;
$$;

REVOKE ALL ON FUNCTION public.profiles_visible() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profiles_visible() TO authenticated, service_role;

-- 2) Views now read masked data only; no raw table access needed by callers
DROP VIEW IF EXISTS public.profiles_secure;
CREATE VIEW public.profiles_secure WITH (security_invoker = on) AS
  SELECT * FROM public.profiles_visible();

DROP VIEW IF EXISTS public.discoverable_profiles;
CREATE VIEW public.discoverable_profiles WITH (security_invoker = on) AS
  SELECT v.id, v.display_name, v.avatar_url
  FROM public.profiles_visible() v
  WHERE v.id <> auth.uid();

REVOKE ALL ON public.profiles_secure FROM anon;
REVOKE ALL ON public.discoverable_profiles FROM anon;
GRANT SELECT ON public.profiles_secure TO authenticated;
GRANT SELECT ON public.discoverable_profiles TO authenticated;

-- 3) Stop raw row exposure of every discoverable profile to all signed-in users
DROP POLICY IF EXISTS "Users can view discoverable profiles" ON public.profiles;

-- 4) Scope email infrastructure policies explicitly to service_role
DROP POLICY IF EXISTS "Service role can insert send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can read send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can update send log" ON public.email_send_log;
CREATE POLICY "Service role can insert send log" ON public.email_send_log
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can read send log" ON public.email_send_log
  FOR SELECT TO service_role USING (true);
CREATE POLICY "Service role can update send log" ON public.email_send_log
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can manage send state" ON public.email_send_state;
CREATE POLICY "Service role can manage send state" ON public.email_send_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert tokens" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can mark tokens as used" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can read tokens" ON public.email_unsubscribe_tokens;
CREATE POLICY "Service role can insert tokens" ON public.email_unsubscribe_tokens
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can mark tokens as used" ON public.email_unsubscribe_tokens
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role can read tokens" ON public.email_unsubscribe_tokens
  FOR SELECT TO service_role USING (true);

DROP POLICY IF EXISTS "Service role can insert suppressed emails" ON public.suppressed_emails;
DROP POLICY IF EXISTS "Service role can read suppressed emails" ON public.suppressed_emails;
CREATE POLICY "Service role can insert suppressed emails" ON public.suppressed_emails
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can read suppressed emails" ON public.suppressed_emails
  FOR SELECT TO service_role USING (true);

-- 5) Signed-in users no longer need this privileged helper directly
REVOKE EXECUTE ON FUNCTION public.check_connection_rate_limit(uuid) FROM authenticated, anon, PUBLIC;