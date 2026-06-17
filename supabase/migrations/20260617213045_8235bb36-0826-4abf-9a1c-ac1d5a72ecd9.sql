ALTER TABLE public.user_preferences
ADD COLUMN IF NOT EXISTS email_notifications_enabled boolean NOT NULL DEFAULT true;