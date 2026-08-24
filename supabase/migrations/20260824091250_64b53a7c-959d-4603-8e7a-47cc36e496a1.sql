DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'social_platform'
  ) THEN
    CREATE TYPE public.social_platform AS ENUM (
      'instagram', 'twitter', 'facebook', 'linkedin', 'tiktok'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.social_handles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  platform public.social_platform NOT NULL,
  handle text NOT NULL,
  url text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_handles TO authenticated;
GRANT ALL ON public.social_handles TO service_role;

ALTER TABLE public.social_handles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own social handles" ON public.social_handles;
CREATE POLICY "Users can manage their own social handles"
  ON public.social_handles
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can view social handles of visible profiles" ON public.social_handles;
CREATE POLICY "Users can view social handles of visible profiles"
  ON public.social_handles
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles_visible() v WHERE v.id = user_id
    )
  );

-- One-time migration: parse handles from existing profile URL columns.
INSERT INTO public.social_handles (user_id, platform, handle, url)
SELECT
  p.id,
  platform.platform::public.social_platform,
  CASE platform.platform
    WHEN 'instagram' THEN NULLIF(regexp_replace(p.instagram_url, '^https?://(www\.)?instagram\.com/([^/?#]+).*$', '\2'), p.instagram_url)
    WHEN 'twitter' THEN NULLIF(regexp_replace(p.twitter_url, '^https?://(www\.)?(twitter|x)\.com/([^/?#]+).*$', '\3'), p.twitter_url)
    WHEN 'facebook' THEN NULLIF(regexp_replace(p.facebook_url, '^https?://(www\.)?facebook\.com/([^/?#]+).*$', '\2'), p.facebook_url)
    WHEN 'linkedin' THEN NULLIF(regexp_replace(p.linkedin_url, '^https?://(www\.)?linkedin\.com/in/([^/?#]+).*$', '\2'), p.linkedin_url)
    WHEN 'tiktok' THEN NULLIF(regexp_replace(p.tiktok_url, '^https?://(www\.)?tiktok\.com/@([^/?#]+).*$', '\2'), p.tiktok_url)
  END,
  CASE platform.platform
    WHEN 'instagram' THEN p.instagram_url
    WHEN 'twitter' THEN p.twitter_url
    WHEN 'facebook' THEN p.facebook_url
    WHEN 'linkedin' THEN p.linkedin_url
    WHEN 'tiktok' THEN p.tiktok_url
  END
FROM public.profiles p
CROSS JOIN (
  VALUES
    ('instagram'::public.social_platform),
    ('twitter'::public.social_platform),
    ('facebook'::public.social_platform),
    ('linkedin'::public.social_platform),
    ('tiktok'::public.social_platform)
) AS platform(platform)
WHERE
  CASE platform.platform
    WHEN 'instagram' THEN p.instagram_url IS NOT NULL AND p.instagram_url <> ''
    WHEN 'twitter' THEN p.twitter_url IS NOT NULL AND p.twitter_url <> ''
    WHEN 'facebook' THEN p.facebook_url IS NOT NULL AND p.facebook_url <> ''
    WHEN 'linkedin' THEN p.linkedin_url IS NOT NULL AND p.linkedin_url <> ''
    WHEN 'tiktok' THEN p.tiktok_url IS NOT NULL AND p.tiktok_url <> ''
  END
ON CONFLICT (user_id, platform) DO NOTHING;

COMMENT ON TABLE public.social_handles IS 'Normalized social media handles per user. Handles are the canonical platform identifiers; URLs are optional fallbacks.';