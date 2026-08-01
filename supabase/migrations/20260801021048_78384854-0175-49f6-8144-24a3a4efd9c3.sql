CREATE TABLE IF NOT EXISTS public.email_notification_throttle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_key text NOT NULL,
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, channel_key)
);

GRANT ALL ON public.email_notification_throttle TO service_role;

ALTER TABLE public.email_notification_throttle ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view email throttle" ON public.email_notification_throttle;
CREATE POLICY "Admins can view email throttle"
ON public.email_notification_throttle
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS update_email_notification_throttle_updated_at ON public.email_notification_throttle;
CREATE TRIGGER update_email_notification_throttle_updated_at
BEFORE UPDATE ON public.email_notification_throttle
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();