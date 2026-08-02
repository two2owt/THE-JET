-- 1. Discoverable defaults to ON and can never be unset/null
UPDATE public.profiles SET discoverable = true WHERE discoverable IS NULL;
ALTER TABLE public.profiles
  ALTER COLUMN discoverable SET DEFAULT true,
  ALTER COLUMN discoverable SET NOT NULL;

-- 2. Rebuild the discovery view: every signed-in user sees every other
--    profile unless that profile explicitly opted out.
DROP VIEW IF EXISTS public.discoverable_profiles;

CREATE VIEW public.discoverable_profiles
WITH (security_invoker = on) AS
  SELECT p.id, p.display_name, p.avatar_url
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND p.id <> auth.uid()
    AND p.discoverable IS DISTINCT FROM false;

GRANT SELECT ON public.discoverable_profiles TO authenticated;