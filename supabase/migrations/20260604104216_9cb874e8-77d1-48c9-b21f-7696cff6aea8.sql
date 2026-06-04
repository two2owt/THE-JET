
CREATE TYPE public.consent_type AS ENUM (
  'foreground_location',
  'background_tracking',
  'push_notifications',
  'messaging_analytics'
);

CREATE TABLE public.user_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  consent_type public.consent_type NOT NULL,
  granted boolean NOT NULL,
  policy_version text NOT NULL DEFAULT '2025-06',
  source text,
  granted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_consents_user_type_created
  ON public.user_consents (user_id, consent_type, created_at DESC);

GRANT SELECT, INSERT ON public.user_consents TO authenticated;
GRANT ALL ON public.user_consents TO service_role;

ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own consents"
  ON public.user_consents FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all consents"
  ON public.user_consents FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can insert their own consents"
  ON public.user_consents FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
