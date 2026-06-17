CREATE OR REPLACE FUNCTION public.enforce_minimum_age()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
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

REVOKE EXECUTE ON FUNCTION public.enforce_minimum_age() FROM PUBLIC, anon, authenticated;