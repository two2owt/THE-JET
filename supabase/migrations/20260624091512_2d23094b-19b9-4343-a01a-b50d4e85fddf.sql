
-- Ensure required extensions
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Helper: invoke notify-favorite-update edge function
CREATE OR REPLACE FUNCTION public.invoke_favorite_update_notify(
  _deal_id uuid,
  _venue_id text,
  _event_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hook_secret TEXT;
  supabase_url TEXT;
BEGIN
  hook_secret := current_setting('app.settings.notify_admin_hook_secret', true);
  supabase_url := current_setting('app.settings.supabase_url', true);

  IF hook_secret IS NULL OR supabase_url IS NULL THEN
    RAISE NOTICE 'invoke_favorite_update_notify: missing settings, skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/notify-favorite-update',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || hook_secret
    ),
    body := jsonb_build_object(
      'deal_id', _deal_id,
      'venue_id', _venue_id,
      'event_type', _event_type
    )
  );
END;
$$;

-- Trigger function: fires on INSERT/UPDATE of deals
CREATE OR REPLACE FUNCTION public.notify_favorite_deal_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.active IS TRUE THEN
      PERFORM public.invoke_favorite_update_notify(NEW.id, NEW.venue_id, 'activated');
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE branch
  IF TG_OP = 'UPDATE' THEN
    -- Activation flip
    IF NEW.active IS TRUE AND OLD.active IS DISTINCT FROM TRUE THEN
      PERFORM public.invoke_favorite_update_notify(NEW.id, NEW.venue_id, 'activated');
      RETURN NEW;
    END IF;

    -- Content update on currently active deal
    IF NEW.active IS TRUE AND (
      NEW.title IS DISTINCT FROM OLD.title
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
      OR NEW.image_url IS DISTINCT FROM OLD.image_url
      OR NEW.starts_at IS DISTINCT FROM OLD.starts_at
    ) THEN
      PERFORM public.invoke_favorite_update_notify(NEW.id, NEW.venue_id, 'updated');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_favorite_deal_change ON public.deals;
CREATE TRIGGER trg_notify_favorite_deal_change
AFTER INSERT OR UPDATE ON public.deals
FOR EACH ROW
EXECUTE FUNCTION public.notify_favorite_deal_change();

-- Track which deals have already sent an ending-soon push to avoid duplicates
CREATE TABLE IF NOT EXISTS public.deal_ending_soon_notified (
  deal_id uuid PRIMARY KEY REFERENCES public.deals(id) ON DELETE CASCADE,
  notified_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.deal_ending_soon_notified TO authenticated;
GRANT ALL ON public.deal_ending_soon_notified TO service_role;

ALTER TABLE public.deal_ending_soon_notified ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages ending-soon log"
ON public.deal_ending_soon_notified
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Hourly ending-soon dispatcher
CREATE OR REPLACE FUNCTION public.dispatch_ending_soon_favorites()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d RECORD;
BEGIN
  FOR d IN
    SELECT id, venue_id
    FROM public.deals
    WHERE active = true
      AND expires_at IS NOT NULL
      AND expires_at > now()
      AND expires_at <= now() + INTERVAL '60 minutes'
      AND id NOT IN (SELECT deal_id FROM public.deal_ending_soon_notified)
  LOOP
    PERFORM public.invoke_favorite_update_notify(d.id, d.venue_id, 'ending_soon');
    INSERT INTO public.deal_ending_soon_notified(deal_id) VALUES (d.id)
    ON CONFLICT (deal_id) DO NOTHING;
  END LOOP;

  -- Cleanup: drop entries for deals long expired
  DELETE FROM public.deal_ending_soon_notified
  WHERE deal_id IN (
    SELECT id FROM public.deals WHERE expires_at < now() - INTERVAL '24 hours'
  );
END;
$$;

-- Schedule hourly (replace if already exists)
DO $$
BEGIN
  PERFORM cron.unschedule('dispatch-ending-soon-favorites');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'dispatch-ending-soon-favorites',
  '*/15 * * * *',
  $$SELECT public.dispatch_ending_soon_favorites();$$
);
