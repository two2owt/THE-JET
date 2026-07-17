-- =============================================================================
-- 1) subscribers table — server-authoritative subscription state.
--    Written by supabase/functions/stripe-webhook (service role), read by client.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  product_id TEXT,
  tier TEXT NOT NULL DEFAULT 'free',
  subscribed BOOLEAN NOT NULL DEFAULT false,
  subscription_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_subscribers_stripe_customer_id
  ON public.subscribers(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscribers_email
  ON public.subscribers(email);

-- Least-privilege grants (client reads own row; backend writes)
GRANT SELECT ON public.subscribers TO authenticated;
GRANT ALL    ON public.subscribers TO service_role;

ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscribers_select_own"
  ON public.subscribers FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- updated_at trigger (reuses existing helper)
DROP TRIGGER IF EXISTS trg_subscribers_updated_at ON public.subscribers;
CREATE TRIGGER trg_subscribers_updated_at
  BEFORE UPDATE ON public.subscribers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- 2) Schedule daily location-retention job (was defined but never scheduled).
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove any prior schedule of the same name (idempotent re-run).
    PERFORM cron.unschedule(jobname)
    FROM cron.job
    WHERE jobname = 'location-data-retention';

    PERFORM cron.schedule(
      'location-data-retention',
      '15 3 * * *',
      $cron$SELECT public.process_location_data_retention();$cron$
    );
  END IF;
END $$;