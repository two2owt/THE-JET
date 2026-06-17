-- Server-side enforcement of the 21+ age requirement on profiles.birthdate
CREATE OR REPLACE FUNCTION public.enforce_minimum_age()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.birthdate IS NOT NULL THEN
    IF NEW.birthdate > (CURRENT_DATE - INTERVAL '21 years') THEN
      RAISE EXCEPTION 'User must be 21 or older'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_minimum_age_trigger ON public.profiles;

CREATE TRIGGER enforce_minimum_age_trigger
BEFORE INSERT OR UPDATE OF birthdate ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_minimum_age();