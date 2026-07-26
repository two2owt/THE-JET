CREATE OR REPLACE FUNCTION public.ensure_user_preferences()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.user_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_user_preferences() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS ensure_user_preferences_on_profile ON public.profiles;

CREATE TRIGGER ensure_user_preferences_on_profile
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.ensure_user_preferences();

-- Backfill any accounts currently missing a preferences row
INSERT INTO public.user_preferences (user_id)
SELECT p.id FROM public.profiles p
LEFT JOIN public.user_preferences up ON up.user_id = p.id
WHERE up.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;