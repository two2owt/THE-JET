CREATE TABLE public.profile_pulse (
  profile_id uuid NOT NULL PRIMARY KEY,
  event text NOT NULL DEFAULT 'updated',
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.profile_pulse TO authenticated;
GRANT ALL ON public.profile_pulse TO service_role;

ALTER TABLE public.profile_pulse ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read profile pulse"
  ON public.profile_pulse FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.bump_profile_pulse()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profile_pulse (profile_id, event, updated_at)
  VALUES (NEW.id, CASE WHEN TG_OP = 'INSERT' THEN 'created' ELSE 'updated' END, now())
  ON CONFLICT (profile_id) DO UPDATE
    SET event = EXCLUDED.event, updated_at = EXCLUDED.updated_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_bump_pulse ON public.profiles;
CREATE TRIGGER profiles_bump_pulse
AFTER INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.bump_profile_pulse();

ALTER PUBLICATION supabase_realtime ADD TABLE public.profile_pulse;

INSERT INTO public.realtime_guard_allowlist (table_name, sensitivity, note, allow_replica_identity_full)
VALUES ('profile_pulse', 'public', 'Heartbeat only: profile id + created/updated flag + timestamp. No profile content.', false)
ON CONFLICT (table_name) DO NOTHING;