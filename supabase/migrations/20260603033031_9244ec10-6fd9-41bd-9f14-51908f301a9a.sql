ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS merchant_id text,
  ADD COLUMN IF NOT EXISTS onboarding_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_deals_merchant_id ON public.deals(merchant_id);
CREATE INDEX IF NOT EXISTS idx_deals_onboarding_completed_at ON public.deals(onboarding_completed_at);