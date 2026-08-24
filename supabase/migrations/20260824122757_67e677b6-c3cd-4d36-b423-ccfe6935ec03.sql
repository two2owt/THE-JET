CREATE TABLE IF NOT EXISTS public.deal_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_id text,
  venue_name text,
  deal_title text,
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','redeemed','void')),
  deal_active_at_issue boolean NOT NULL DEFAULT true,
  deal_active_at_redemption boolean,
  issued_at timestamptz NOT NULL DEFAULT now(),
  redeemed_at timestamptz,
  redeemed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, deal_id)
);

CREATE INDEX IF NOT EXISTS deal_redemptions_deal_idx ON public.deal_redemptions (deal_id);
CREATE INDEX IF NOT EXISTS deal_redemptions_status_idx ON public.deal_redemptions (status, redeemed_at DESC);
CREATE INDEX IF NOT EXISTS deal_redemptions_user_idx ON public.deal_redemptions (user_id);

GRANT SELECT, INSERT ON public.deal_redemptions TO authenticated;
GRANT UPDATE ON public.deal_redemptions TO authenticated;
GRANT ALL ON public.deal_redemptions TO service_role;

ALTER TABLE public.deal_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own redemptions" ON public.deal_redemptions;
CREATE POLICY "Users view own redemptions"
  ON public.deal_redemptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

DROP POLICY IF EXISTS "Users create own redemptions" ON public.deal_redemptions;
CREATE POLICY "Users create own redemptions"
  ON public.deal_redemptions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'issued');

DROP POLICY IF EXISTS "Staff mark redemptions" ON public.deal_redemptions;
CREATE POLICY "Staff mark redemptions"
  ON public.deal_redemptions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

DROP TRIGGER IF EXISTS deal_redemptions_touch ON public.deal_redemptions;
CREATE TRIGGER deal_redemptions_touch
  BEFORE UPDATE ON public.deal_redemptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.redeem_deal_code(_code text)
RETURNS TABLE (
  status text,
  code text,
  deal_id uuid,
  deal_title text,
  venue_name text,
  redeemed_at timestamptz,
  deal_active boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.deal_redemptions%ROWTYPE;
  _active boolean;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO _row FROM public.deal_redemptions r WHERE r.code = _code FOR UPDATE;

  IF _row.id IS NULL THEN
    RETURN QUERY SELECT 'not_found'::text, _code, NULL::uuid, NULL::text, NULL::text, NULL::timestamptz, NULL::boolean;
    RETURN;
  END IF;

  SELECT d.active AND d.expires_at > now() INTO _active FROM public.deals d WHERE d.id = _row.deal_id;

  IF _row.status = 'redeemed' THEN
    RETURN QUERY SELECT 'already_redeemed'::text, _row.code, _row.deal_id, _row.deal_title, _row.venue_name, _row.redeemed_at, COALESCE(_active, false);
    RETURN;
  END IF;

  IF _row.status = 'void' THEN
    RETURN QUERY SELECT 'void'::text, _row.code, _row.deal_id, _row.deal_title, _row.venue_name, _row.redeemed_at, COALESCE(_active, false);
    RETURN;
  END IF;

  UPDATE public.deal_redemptions
     SET status = 'redeemed',
         redeemed_at = now(),
         redeemed_by = auth.uid(),
         deal_active_at_redemption = COALESCE(_active, false)
   WHERE id = _row.id
   RETURNING * INTO _row;

  RETURN QUERY SELECT 'redeemed'::text, _row.code, _row.deal_id, _row.deal_title, _row.venue_name, _row.redeemed_at, COALESCE(_active, false);
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_deal_code(text) FROM public;
GRANT EXECUTE ON FUNCTION public.redeem_deal_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_deal_code(text) TO service_role;