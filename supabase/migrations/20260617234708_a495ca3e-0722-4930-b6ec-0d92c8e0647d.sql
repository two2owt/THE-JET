
CREATE TABLE public.admin_security_findings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scanner_name TEXT NOT NULL,
  internal_id TEXT NOT NULL,
  title TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  fixed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scanner_name, internal_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_security_findings TO authenticated;
GRANT ALL ON public.admin_security_findings TO service_role;

ALTER TABLE public.admin_security_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view security findings"
  ON public.admin_security_findings FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert security findings"
  ON public.admin_security_findings FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update security findings"
  ON public.admin_security_findings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete security findings"
  ON public.admin_security_findings FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER admin_security_findings_updated_at
  BEFORE UPDATE ON public.admin_security_findings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.admin_security_finding_acks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  finding_id UUID NOT NULL REFERENCES public.admin_security_findings(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (admin_id, finding_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_security_finding_acks TO authenticated;
GRANT ALL ON public.admin_security_finding_acks TO service_role;

ALTER TABLE public.admin_security_finding_acks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view own acks"
  ON public.admin_security_finding_acks FOR SELECT
  TO authenticated
  USING (auth.uid() = admin_id AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins insert own acks"
  ON public.admin_security_finding_acks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = admin_id AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete own acks"
  ON public.admin_security_finding_acks FOR DELETE
  TO authenticated
  USING (auth.uid() = admin_id AND public.has_role(auth.uid(), 'admin'::app_role));
