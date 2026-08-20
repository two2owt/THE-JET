ALTER TABLE public.push_subscriptions RENAME TO push_notifications;

CREATE OR REPLACE FUNCTION public.claim_push_subscription(_endpoint text, _p256dh text, _auth text, _platform text DEFAULT 'web'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF _endpoint IS NULL OR length(_endpoint) = 0 THEN
    RAISE EXCEPTION 'endpoint required';
  END IF;

  INSERT INTO public.push_notifications (
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
$function$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_notifications TO authenticated;
GRANT ALL ON public.push_notifications TO service_role;