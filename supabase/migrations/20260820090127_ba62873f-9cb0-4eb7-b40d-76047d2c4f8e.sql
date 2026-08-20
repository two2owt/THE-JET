CREATE TABLE IF NOT EXISTS public.push_notification_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('preference_enabled','preference_disabled','device_enabled','device_disabled','permission_revoked','no_change')),
  source text NOT NULL,
  platform text,
  endpoint_tail text,
  detail jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_notification_audit_user_created_idx
  ON public.push_notification_audit (user_id, created_at DESC);

GRANT SELECT, INSERT ON public.push_notification_audit TO authenticated;
GRANT ALL ON public.push_notification_audit TO service_role;

ALTER TABLE public.push_notification_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own push audit" ON public.push_notification_audit;
CREATE POLICY "Users can view their own push audit"
  ON public.push_notification_audit FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can add their own push audit" ON public.push_notification_audit;
CREATE POLICY "Users can add their own push audit"
  ON public.push_notification_audit FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all push audit" ON public.push_notification_audit;
CREATE POLICY "Admins can view all push audit"
  ON public.push_notification_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));