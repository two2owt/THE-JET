ALTER TABLE public.push_notifications
  ADD COLUMN IF NOT EXISTS device_id text;

CREATE INDEX IF NOT EXISTS push_notifications_user_device_idx
  ON public.push_notifications (user_id, device_id)
  WHERE device_id IS NOT NULL;