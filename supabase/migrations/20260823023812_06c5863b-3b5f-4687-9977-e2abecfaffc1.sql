-- Effective plan for a user, derived from the billing row the Stripe webhook owns.
-- SECURITY INVOKER: `subscribers` RLS already scopes SELECT to auth.uid(), so a
-- caller can only ever resolve their own tier. Expired rows collapse to 'free'.
CREATE OR REPLACE FUNCTION public.effective_subscription_tier(_user_id uuid DEFAULT auth.uid())
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT CASE
               WHEN s.tier IN ('jet_plus', 'jetx') THEN s.tier
               ELSE 'free'
             END
      FROM public.subscribers s
      WHERE s.user_id = _user_id
        AND s.subscribed IS TRUE
        AND (s.subscription_end IS NULL OR s.subscription_end > now())
      LIMIT 1
    ),
    'free'
  );
$$;

-- Authoritative feature gate. Mirrors the client's useFeatureAccess ordering:
-- monetization off  -> everything unlocked
-- admins            -> everything unlocked
-- otherwise         -> tier rank must meet the requirement
CREATE OR REPLACE FUNCTION public.has_feature_access(_required text, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    WHEN NOT COALESCE(
      (SELECT (value #>> '{}') IN ('true', 'enabled')
         FROM public.app_config WHERE key = 'monetization_enabled'),
      false
    ) THEN true
    WHEN public.has_role(_user_id, 'admin'::app_role) THEN true
    ELSE
      CASE public.effective_subscription_tier(_user_id)
        WHEN 'jetx' THEN 2 WHEN 'jet_plus' THEN 1 ELSE 0 END
      >=
      CASE _required
        WHEN 'jetx' THEN 2 WHEN 'jet_plus' THEN 1 ELSE 0 END
  END;
$$;

GRANT EXECUTE ON FUNCTION public.effective_subscription_tier(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_feature_access(text, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.effective_subscription_tier(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_feature_access(text, uuid) FROM anon;

-- ---------------------------------------------------------------------------
-- JET+ social write surfaces: enforce the tier server-side, not just in the UI.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can create connection requests with rate limit" ON public.user_connections;
CREATE POLICY "Users can create connection requests with rate limit"
  ON public.user_connections FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.check_connection_rate_limit(auth.uid())
    AND public.has_feature_access('jet_plus')
  );

DROP POLICY IF EXISTS "Users can add their own shares" ON public.deal_shares;
CREATE POLICY "Users can add their own shares"
  ON public.deal_shares FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.has_feature_access('jet_plus')
  );

DROP POLICY IF EXISTS "Users can create their own reviews" ON public.venue_reviews;
CREATE POLICY "Users can create their own reviews"
  ON public.venue_reviews FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.has_feature_access('jet_plus')
  );

DROP POLICY IF EXISTS "Users can update their own reviews" ON public.venue_reviews;
CREATE POLICY "Users can update their own reviews"
  ON public.venue_reviews FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND public.has_feature_access('jet_plus')
  );