
CREATE TABLE IF NOT EXISTS public.security_finding_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  finding_id UUID NOT NULL,
  scanner_name TEXT NOT NULL,
  internal_id TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  notified_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (finding_id, status, alert_type)
);

GRANT ALL ON public.security_finding_alerts TO service_role;
ALTER TABLE public.security_finding_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view security alert log"
  ON public.security_finding_alerts
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
