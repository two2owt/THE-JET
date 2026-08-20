CREATE OR REPLACE FUNCTION public.notify_admin_of_new_deal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  webhook_secret TEXT;
  supabase_url TEXT;
BEGIN
  SELECT decrypted_secret INTO webhook_secret
  FROM vault.decrypted_secrets WHERE name = 'notify_admin_hook_secret';
  SELECT decrypted_secret INTO supabase_url
  FROM vault.decrypted_secrets WHERE name = 'project_url';

  webhook_secret := COALESCE(webhook_secret, current_setting('app.settings.notify_admin_hook_secret', true));
  supabase_url := COALESCE(supabase_url, current_setting('app.settings.supabase_url', true));

  IF supabase_url IS NULL OR supabase_url = '' OR webhook_secret IS NULL OR webhook_secret = '' THEN
    RAISE NOTICE 'notify_admin_of_new_deal: missing settings, skipping notification';
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := rtrim(supabase_url, '/') || '/functions/v1/notify-admin-new-deal',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || webhook_secret
      ),
      body := jsonb_build_object('record', to_jsonb(NEW))
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_admin_of_new_deal: notification failed (deal preserved): %', SQLERRM;
  END;

  RETURN NEW;
END;
$function$;