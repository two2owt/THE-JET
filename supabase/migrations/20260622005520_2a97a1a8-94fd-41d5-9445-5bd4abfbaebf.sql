ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS auto_reload_updates boolean NOT NULL DEFAULT false;

GRANT SELECT, INSERT, UPDATE ON public.user_preferences TO authenticated;
GRANT ALL ON public.user_preferences TO service_role;