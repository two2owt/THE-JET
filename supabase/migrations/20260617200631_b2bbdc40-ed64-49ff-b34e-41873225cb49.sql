ALTER TABLE public.user_preferences
  ALTER COLUMN location_tracking_enabled SET DEFAULT true;

UPDATE public.user_preferences
SET location_tracking_enabled = true
WHERE location_tracking_enabled = false;