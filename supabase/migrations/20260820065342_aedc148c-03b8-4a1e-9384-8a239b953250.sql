-- Store the favorite-alert hook secret in Vault and read it from the invoker
-- function, so the trigger path works regardless of session role settings.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'favorite_notify_hook_secret') THEN
    PERFORM vault.create_secret('f5102eabb7b898f8f5a2460d0efe46c9e5c9e7d56d8d3c05', 'favorite_notify_hook_secret', 'Bearer secret for notify-favorite-update');
  ELSE
    PERFORM vault.update_secret((SELECT id FROM vault.secrets WHERE name = 'favorite_notify_hook_secret'), 'f5102eabb7b898f8f5a2460d0efe46c9e5c9e7d56d8d3c05');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'project_url') THEN
    PERFORM vault.create_secret('https://zbrscuoqmkdbmdimdnqu.supabase.co', 'project_url', 'Supabase project base URL');
  END IF;
END $$;

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
  SELECT decrypted_secret INTO hook_secret
  FROM vault.decrypted_secrets WHERE name = 'favorite_notify_hook_secret';
  SELECT decrypted_secret INTO supabase_url
  FROM vault.decrypted_secrets WHERE name = 'project_url';

  hook_secret := COALESCE(hook_secret, current_setting('app.settings.notify_admin_hook_secret', true));
  supabase_url := COALESCE(supabase_url, current_setting('app.settings.supabase_url', true));

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

REVOKE EXECUTE ON FUNCTION public.invoke_favorite_update_notify(uuid, text, text) FROM PUBLIC, anon, authenticated;