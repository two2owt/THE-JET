CREATE TABLE IF NOT EXISTS public.native_push_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  queue_id uuid REFERENCES public.notification_queue(id) ON DELETE SET NULL,
  user_id uuid,
  subscription_id uuid,
  platform text NOT NULL DEFAULT 'unknown',
  token_tail text,
  status text NOT NULL,
  http_status integer,
  provider_message_id text,
  error text,
  category text,
  event_type text,
  audience text,
  attempted_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT native_push_audit_status_check CHECK (status IN ('sent','failed','unregistered','skipped'))
);

CREATE INDEX IF NOT EXISTS native_push_audit_created_at_idx ON public.native_push_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS native_push_audit_subscription_idx ON public.native_push_audit (subscription_id, created_at DESC);
CREATE INDEX IF NOT EXISTS native_push_audit_status_idx ON public.native_push_audit (status, created_at DESC);
CREATE INDEX IF NOT EXISTS native_push_audit_user_idx ON public.native_push_audit (user_id, created_at DESC);

GRANT SELECT ON public.native_push_audit TO authenticated;
GRANT ALL ON public.native_push_audit TO service_role;

ALTER TABLE public.native_push_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view native push audit" ON public.native_push_audit;
CREATE POLICY "Admins can view native push audit"
ON public.native_push_audit
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));