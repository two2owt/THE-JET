
REVOKE EXECUTE ON FUNCTION public.invoke_favorite_update_notify(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_favorite_deal_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dispatch_ending_soon_favorites() FROM PUBLIC, anon, authenticated;
