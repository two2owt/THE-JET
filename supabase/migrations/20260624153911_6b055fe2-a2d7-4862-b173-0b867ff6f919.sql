CREATE OR REPLACE VIEW public.discoverable_profiles
WITH (security_invoker = off) AS
SELECT id, display_name, avatar_url
FROM public.profiles p
WHERE auth.uid() IS NOT NULL
  AND id <> auth.uid()
  AND discoverable IS TRUE
  AND NOT EXISTS (
    SELECT 1 FROM public.user_connections uc
    WHERE (uc.user_id = auth.uid() AND uc.friend_id = p.id)
       OR (uc.friend_id = auth.uid() AND uc.user_id = p.id)
  );

GRANT SELECT ON public.discoverable_profiles TO authenticated;
REVOKE SELECT ON public.discoverable_profiles FROM anon;