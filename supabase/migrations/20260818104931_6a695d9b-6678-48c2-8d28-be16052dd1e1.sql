CREATE OR REPLACE FUNCTION public.admin_backfill_display_names(_dry_run boolean DEFAULT true)
RETURNS TABLE(auto_handles_assigned integer, claimed_flags_set integer, dry_run boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auto integer := 0;
  v_claimed integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF _dry_run THEN
    SELECT count(*) INTO v_auto
    FROM public.profiles
    WHERE display_name IS NULL
       OR btrim(display_name) = ''
       OR display_name LIKE '%@%';

    SELECT count(*) INTO v_claimed
    FROM public.profiles p
    WHERE p.display_name IS NOT NULL
      AND btrim(p.display_name) <> ''
      AND p.display_name NOT LIKE '%@%'
      AND p.display_name <> public.generate_auto_handle(p.id)
      AND p.display_name_claimed = false;
  ELSE
    WITH updated AS (
      UPDATE public.profiles
      SET display_name = public.generate_auto_handle(id),
          display_name_claimed = false,
          updated_at = now()
      WHERE display_name IS NULL
         OR btrim(display_name) = ''
         OR display_name LIKE '%@%'
      RETURNING 1
    )
    SELECT count(*) INTO v_auto FROM updated;

    WITH claimed AS (
      UPDATE public.profiles p
      SET display_name_claimed = true,
          updated_at = now()
      WHERE p.display_name IS NOT NULL
        AND btrim(p.display_name) <> ''
        AND p.display_name NOT LIKE '%@%'
        AND p.display_name <> public.generate_auto_handle(p.id)
        AND p.display_name_claimed = false
      RETURNING 1
    )
    SELECT count(*) INTO v_claimed FROM claimed;
  END IF;

  RETURN QUERY SELECT v_auto, v_claimed, _dry_run;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_backfill_display_names(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_backfill_display_names(boolean) TO authenticated, service_role;