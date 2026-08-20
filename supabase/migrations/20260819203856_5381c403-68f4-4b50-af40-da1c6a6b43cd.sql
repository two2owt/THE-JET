-- idempotency-check: allow-dml
DELETE FROM public.push_subscriptions a
USING public.push_subscriptions b
WHERE a.ctid < b.ctid
  AND a.endpoint = b.endpoint;

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_key
  ON public.push_subscriptions (endpoint);

DROP INDEX IF EXISTS public.push_subscriptions_user_endpoint_key;

CREATE OR REPLACE FUNCTION public.claim_push_subscription(
  _endpoint text,
  _p256dh text,
  _auth text,
  _platform text DEFAULT 'web'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF _endpoint IS NULL OR length(_endpoint) = 0 THEN
    RAISE EXCEPTION 'endpoint required';
  END IF;

  INSERT INTO public.push_subscriptions (
    user_id, endpoint, p256dh_key, auth_key, platform, active, updated_at
  )
  VALUES (
    _uid, _endpoint, COALESCE(_p256dh, ''), COALESCE(_auth, ''),
    COALESCE(_platform, 'web'), true, now()
  )
  ON CONFLICT (endpoint) DO UPDATE
  SET user_id = EXCLUDED.user_id,
      p256dh_key = EXCLUDED.p256dh_key,
      auth_key = EXCLUDED.auth_key,
      platform = EXCLUDED.platform,
      active = true,
      updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.claim_push_subscription(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_push_subscription(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_push_subscription(text, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.generate_auto_handle(_user_id uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT 'jet_' || substr(md5(_user_id::text), 1, 6)
$$;

REVOKE ALL ON FUNCTION public.generate_auto_handle(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_auto_handle(uuid) TO authenticated, service_role;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name_claimed boolean NOT NULL DEFAULT false;

-- idempotency-check: allow-dml
UPDATE public.profiles
SET display_name = public.generate_auto_handle(id),
    display_name_claimed = false
WHERE display_name IS NULL
   OR btrim(display_name) = ''
   OR display_name LIKE '%@%';

-- idempotency-check: allow-dml
UPDATE public.profiles
SET display_name_claimed = true
WHERE display_name IS NOT NULL
  AND btrim(display_name) <> ''
  AND display_name NOT LIKE '%@%'
  AND display_name <> public.generate_auto_handle(id)
  AND display_name_claimed = false;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  meta_name text := nullif(btrim(new.raw_user_meta_data->>'display_name'), '');
BEGIN
  INSERT INTO public.profiles (id, display_name, display_name_claimed)
  VALUES (
    new.id,
    COALESCE(meta_name, public.generate_auto_handle(new.id)),
    meta_name IS NOT NULL
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_preferences (user_id)
  VALUES (new.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;