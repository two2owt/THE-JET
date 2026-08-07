-- 1. Per-user notification settings (quiet hours + category opt-outs)
CREATE TABLE IF NOT EXISTS public.user_notification_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  timezone text NOT NULL DEFAULT 'America/New_York',
  quiet_hours_enabled boolean NOT NULL DEFAULT true,
  quiet_hours_start smallint NOT NULL DEFAULT 22,
  quiet_hours_end smallint NOT NULL DEFAULT 8,
  categories jsonb NOT NULL DEFAULT '{"deals":true,"favorites":true,"social":true,"system":true,"marketing":false}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_notification_settings TO authenticated;
GRANT ALL ON public.user_notification_settings TO service_role;
ALTER TABLE public.user_notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own notification settings"
  ON public.user_notification_settings FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER user_notification_settings_updated_at
  BEFORE UPDATE ON public.user_notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Notification queue
CREATE TABLE IF NOT EXISTS public.notification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  source text NOT NULL DEFAULT 'jet_bridge',
  event_type text NOT NULL,
  category text NOT NULL DEFAULT 'deals',
  title text NOT NULL,
  body text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  venue_id text,
  neighborhood_id uuid REFERENCES public.neighborhoods(id) ON DELETE SET NULL,
  target_user_ids uuid[],
  audience text NOT NULL DEFAULT 'favorites',
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  processed_at timestamptz,
  last_error text,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_queue_status_check
    CHECK (status IN ('pending','processing','sent','failed','skipped')),
  CONSTRAINT notification_queue_audience_check
    CHECK (audience IN ('favorites','users','neighborhood','all'))
);

CREATE INDEX IF NOT EXISTS notification_queue_claim_idx
  ON public.notification_queue (status, scheduled_at);

GRANT SELECT ON public.notification_queue TO authenticated;
GRANT ALL ON public.notification_queue TO service_role;
ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view notification queue"
  ON public.notification_queue FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER notification_queue_updated_at
  BEFORE UPDATE ON public.notification_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Delivery ledger
CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid NOT NULL REFERENCES public.notification_queue(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id uuid,
  channel text NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  error text,
  opened_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_deliveries_channel_check
    CHECK (channel IN ('web','native','email','skipped')),
  CONSTRAINT notification_deliveries_status_check
    CHECK (status IN ('sent','failed','skipped','opened'))
);

CREATE INDEX IF NOT EXISTS notification_deliveries_queue_idx
  ON public.notification_deliveries (queue_id);
CREATE INDEX IF NOT EXISTS notification_deliveries_user_idx
  ON public.notification_deliveries (user_id, created_at DESC);

GRANT SELECT ON public.notification_deliveries TO authenticated;
GRANT ALL ON public.notification_deliveries TO service_role;
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own deliveries"
  ON public.notification_deliveries FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

-- 4. Prevent duplicate device registrations
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_key
  ON public.push_subscriptions (endpoint);

-- 5. Atomic batch claim for the dispatch worker
CREATE OR REPLACE FUNCTION public.claim_notification_batch(_limit integer DEFAULT 10)
RETURNS SETOF public.notification_queue
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.notification_queue q
  SET status = 'processing', locked_at = now(), attempts = q.attempts + 1
  WHERE q.id IN (
    SELECT id FROM public.notification_queue
    WHERE scheduled_at <= now()
      AND (
        status = 'pending'
        OR (status = 'processing' AND locked_at < now() - interval '5 minutes')
      )
      AND attempts < max_attempts
    ORDER BY scheduled_at
    FOR UPDATE SKIP LOCKED
    LIMIT _limit
  )
  RETURNING q.*;
$$;

REVOKE ALL ON FUNCTION public.claim_notification_batch(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_batch(integer) TO service_role;