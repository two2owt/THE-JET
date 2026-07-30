-- Create a function to notify admin of new deals
CREATE OR REPLACE FUNCTION notify_admin_of_new_deal()
RETURNS TRIGGER AS $$
BEGIN
  -- Call the edge function to send email notification
  PERFORM net.http_post(
    url := (SELECT current_setting('app.settings.supabase_url', true)) || '/functions/v1/notify-admin-new-deal',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT current_setting('app.settings.supabase_anon_key', true))
    ),
    body := jsonb_build_object('record', to_jsonb(NEW))
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger that fires when a new deal is inserted
DROP TRIGGER IF EXISTS on_deal_created ON public.deals;
CREATE TRIGGER on_deal_created
AFTER INSERT ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION notify_admin_of_new_deal();