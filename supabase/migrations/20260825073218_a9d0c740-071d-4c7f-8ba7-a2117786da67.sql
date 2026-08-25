-- 1. Lock down anon EXECUTE on SECURITY DEFINER redemption function
REVOKE EXECUTE ON FUNCTION public.redeem_deal_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_deal_code(text) TO authenticated, service_role;

-- 2. Restrict app_config reads: signed-out users only see the public monetization flag
DROP POLICY IF EXISTS "app_config readable by everyone" ON public.app_config;

CREATE POLICY "app_config readable by authenticated"
ON public.app_config FOR SELECT TO authenticated
USING (true);

CREATE POLICY "app_config public keys readable by anon"
ON public.app_config FOR SELECT TO anon
USING (key IN ('monetization_enabled'));

-- 3. deal_redemptions: explicit deny of deletes (immutable audit trail)
CREATE POLICY "Redemptions cannot be deleted"
ON public.deal_redemptions AS RESTRICTIVE FOR DELETE TO authenticated, anon
USING (false);