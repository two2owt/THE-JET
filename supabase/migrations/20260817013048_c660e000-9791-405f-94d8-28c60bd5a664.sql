ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS marketing_emails_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_consent_updated_at timestamptz;

CREATE TABLE IF NOT EXISTS public.marketing_audience_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience_id text NOT NULL,
  synced_count integer NOT NULL DEFAULT 0,
  removed_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.marketing_audience_sync_log TO authenticated;
GRANT ALL ON public.marketing_audience_sync_log TO service_role;

ALTER TABLE public.marketing_audience_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view marketing sync log" ON public.marketing_audience_sync_log;
CREATE POLICY "Admins can view marketing sync log"
ON public.marketing_audience_sync_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));