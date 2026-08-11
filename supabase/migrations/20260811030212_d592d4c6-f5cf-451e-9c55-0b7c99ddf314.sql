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
    user_id,
    endpoint,
    p256dh_key,
    auth_key,
    platform,
    active,
    updated_at
  )
  VALUES (
    _uid,
    _endpoint,
    COALESCE(_p256dh, ''),
    COALESCE(_auth, ''),
    COALESCE(_platform, 'web'),
    true,
    now()
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