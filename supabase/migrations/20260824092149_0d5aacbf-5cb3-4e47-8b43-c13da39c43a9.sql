CREATE OR REPLACE FUNCTION public.bump_profile_pulse_from_social()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profile_pulse (profile_id, event, updated_at)
  VALUES (COALESCE(NEW.user_id, OLD.user_id), 'updated', now())
  ON CONFLICT (profile_id) DO UPDATE
    SET event = EXCLUDED.event, updated_at = EXCLUDED.updated_at;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS profiles_pulse_bump ON public.profiles;
CREATE TRIGGER profiles_pulse_bump
AFTER INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.bump_profile_pulse();

DROP TRIGGER IF EXISTS social_handles_pulse_bump ON public.social_handles;
CREATE TRIGGER social_handles_pulse_bump
AFTER INSERT OR UPDATE OR DELETE ON public.social_handles
FOR EACH ROW EXECUTE FUNCTION public.bump_profile_pulse_from_social();

-- idempotency-check: allow-dml
INSERT INTO public.profile_pulse (profile_id, event, updated_at)
SELECT p.id, 'updated', now() FROM public.profiles p
ON CONFLICT (profile_id) DO NOTHING;