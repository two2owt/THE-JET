CREATE TABLE IF NOT EXISTS public.app_config_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  old_value jsonb,
  new_value jsonb NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_config_audit_key_changed_at_idx
  ON public.app_config_audit (key, changed_at DESC);

GRANT SELECT ON public.app_config_audit TO authenticated;
GRANT ALL ON public.app_config_audit TO service_role;

ALTER TABLE public.app_config_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_config_audit readable by admins" ON public.app_config_audit;
CREATE POLICY "app_config_audit readable by admins"
  ON public.app_config_audit FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Written only by the trigger below (SECURITY DEFINER); no role may write directly.
CREATE OR REPLACE FUNCTION public.app_config_audit_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.value IS NOT DISTINCT FROM NEW.value THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.app_config_audit (key, old_value, new_value, changed_by)
  VALUES (
    NEW.key,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.value ELSE NULL END,
    NEW.value,
    auth.uid()
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.app_config_audit_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS app_config_audit_trg ON public.app_config;
CREATE TRIGGER app_config_audit_trg
  AFTER INSERT OR UPDATE ON public.app_config
  FOR EACH ROW EXECUTE FUNCTION public.app_config_audit_write();