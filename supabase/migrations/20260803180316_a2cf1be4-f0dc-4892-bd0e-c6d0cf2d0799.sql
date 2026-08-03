-- Views enforce their own access checks internally; run them with owner rights
ALTER VIEW public.profiles_secure SET (security_invoker = false);
ALTER VIEW public.discoverable_profiles SET (security_invoker = false);

REVOKE ALL ON public.profiles_secure FROM anon;
REVOKE ALL ON public.discoverable_profiles FROM anon;
GRANT SELECT ON public.profiles_secure TO authenticated;
GRANT SELECT ON public.discoverable_profiles TO authenticated;

-- Remove full-row access for connections; privacy-filtered view is the only path
DROP POLICY IF EXISTS "Users can view connected profiles with privacy" ON public.profiles;