CREATE TABLE IF NOT EXISTS public.app_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT 'null'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT ON public.app_config TO anon;
GRANT SELECT, INSERT, UPDATE ON public.app_config TO authenticated;
GRANT ALL ON public.app_config TO service_role;

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_config readable by everyone" ON public.app_config;
CREATE POLICY "app_config readable by everyone"
  ON public.app_config FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "app_config insertable by admins" ON public.app_config;
CREATE POLICY "app_config insertable by admins"
  ON public.app_config FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "app_config updatable by admins" ON public.app_config;
CREATE POLICY "app_config updatable by admins"
  ON public.app_config FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.app_config_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS app_config_touch_trg ON public.app_config;
CREATE TRIGGER app_config_touch_trg
  BEFORE INSERT OR UPDATE ON public.app_config
  FOR EACH ROW EXECUTE FUNCTION public.app_config_touch();

ALTER TABLE public.app_config REPLICA IDENTITY DEFAULT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'app_config'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.app_config;
  END IF;
END $$;

-- idempotency-check: allow-dml
INSERT INTO public.realtime_guard_allowlist
  (table_name, sensitivity, note, allow_replica_identity_full)
VALUES
  ('app_config', 'public', 'Global feature flags (e.g. monetization_enabled). No user data; readable by everyone by design.', false)
ON CONFLICT (table_name) DO UPDATE
  SET sensitivity = EXCLUDED.sensitivity,
      note = EXCLUDED.note,
      allow_replica_identity_full = EXCLUDED.allow_replica_identity_full;

-- idempotency-check: allow-dml
INSERT INTO public.app_config (key, value)
VALUES ('monetization_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;