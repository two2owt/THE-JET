-- Forward-only, idempotent schema reconciliation for Test -> Live publishing.
-- This migration intentionally preserves all user and notification data.

-- 1. Keep precise user location coordinates out of database realtime broadcasts.
DO $reconcile_publication$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'user_locations'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.user_locations;
  END IF;
END
$reconcile_publication$;

-- 2. Restore explicit Data API grants required by the notification subsystem.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_notification_settings TO authenticated;
GRANT ALL ON public.user_notification_settings TO service_role;
GRANT SELECT ON public.notification_queue TO authenticated;
GRANT ALL ON public.notification_queue TO service_role;
GRANT SELECT, UPDATE ON public.notification_deliveries TO authenticated;
GRANT ALL ON public.notification_deliveries TO service_role;

ALTER TABLE public.user_notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

-- 3. Recreate all notification policies deterministically.
DROP POLICY IF EXISTS "Users manage own notification settings" ON public.user_notification_settings;
CREATE POLICY "Users manage own notification settings"
  ON public.user_notification_settings
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins view notification queue" ON public.notification_queue;
CREATE POLICY "Admins view notification queue"
  ON public.notification_queue
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Users view queue rows delivered to them" ON public.notification_queue;
CREATE POLICY "Users view queue rows delivered to them"
  ON public.notification_queue
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.notification_deliveries d
      WHERE d.queue_id = notification_queue.id
        AND d.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users view own deliveries" ON public.notification_deliveries;
CREATE POLICY "Users view own deliveries"
  ON public.notification_deliveries
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Users mark own deliveries opened" ON public.notification_deliveries;
CREATE POLICY "Users mark own deliveries opened"
  ON public.notification_deliveries
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. Rebuild indexes without relying on drifted object names.
CREATE INDEX IF NOT EXISTS notification_queue_claim_idx
  ON public.notification_queue (status, scheduled_at);
CREATE INDEX IF NOT EXISTS notification_deliveries_queue_idx
  ON public.notification_deliveries (queue_id);
CREATE INDEX IF NOT EXISTS notification_deliveries_user_idx
  ON public.notification_deliveries (user_id, created_at DESC);

-- Keep one canonical row per web/native endpoint before enforcing uniqueness.
DELETE FROM public.push_subscriptions older
USING public.push_subscriptions newer
WHERE older.endpoint = newer.endpoint
  AND (
    older.updated_at < newer.updated_at
    OR (older.updated_at IS NOT DISTINCT FROM newer.updated_at AND older.ctid < newer.ctid)
  );

DROP INDEX IF EXISTS public.push_subscriptions_user_endpoint_key;
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_key
  ON public.push_subscriptions (endpoint);

-- 5. Restore the authenticated device-claim RPC in its canonical form.
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
AS $claim$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF _endpoint IS NULL OR length(btrim(_endpoint)) = 0 THEN
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
    COALESCE(NULLIF(_platform, ''), 'web'),
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
$claim$;

REVOKE ALL ON FUNCTION public.claim_push_subscription(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_push_subscription(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_push_subscription(text, text, text, text) TO service_role;

-- 6. Rebuild update triggers safely.
DROP TRIGGER IF EXISTS user_notification_settings_updated_at ON public.user_notification_settings;
CREATE TRIGGER user_notification_settings_updated_at
  BEFORE UPDATE ON public.user_notification_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS notification_queue_updated_at ON public.notification_queue;
CREATE TRIGGER notification_queue_updated_at
  BEFORE UPDATE ON public.notification_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Email queue tables are optional during restore; the helper is already defensive.
DO $email_triggers$
BEGIN
  IF to_regprocedure('public.ensure_email_queue_triggers()') IS NOT NULL THEN
    PERFORM public.ensure_email_queue_triggers();
  END IF;
END
$email_triggers$;