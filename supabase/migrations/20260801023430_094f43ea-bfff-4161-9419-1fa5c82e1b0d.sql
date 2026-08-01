ALTER VIEW public.discoverable_profiles SET (security_invoker = off);
REVOKE ALL ON public.discoverable_profiles FROM anon, public;
GRANT SELECT ON public.discoverable_profiles TO authenticated;