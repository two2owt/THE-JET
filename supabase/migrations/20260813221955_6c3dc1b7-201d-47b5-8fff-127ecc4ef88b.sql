DO $$
DECLARE
  _expected text[] := ARRAY[
    'deals','email_send_log','messages','search_history',
    'user_connections','user_favorites','venue_reviews'
  ];
  _deny text[] := ARRAY[
    'user_locations','profiles','user_consents','security_audit_logs',
    'push_subscriptions','notification_logs','deal_shares'
  ];
  _t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'supabase_realtime publication not present; nothing to reconcile.';
    RETURN;
  END IF;

  -- 1. Remove anything published that is not on the expected list
  --    (covers the deny list and any other drift, including partial-column entries).
  FOR _t IN
    SELECT DISTINCT pt.tablename
    FROM pg_publication_tables pt
    WHERE pt.pubname = 'supabase_realtime'
      AND pt.schemaname = 'public'
      AND NOT (pt.tablename = ANY (_expected))
  LOOP
    EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', _t);
    RAISE NOTICE 'Removed public.% from supabase_realtime', _t;
  END LOOP;

  -- 2. Add every expected table that exists but is not yet published.
  FOREACH _t IN ARRAY _expected LOOP
    IF to_regclass('public.' || quote_ident(_t)) IS NULL THEN
      RAISE NOTICE 'Skipping public.% (table does not exist here)', _t;
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = _t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', _t);
      RAISE NOTICE 'Added public.% to supabase_realtime', _t;
    END IF;
  END LOOP;

  -- 3. Fail loudly if any deny-listed table somehow remains published.
  FOREACH _t IN ARRAY _deny LOOP
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = _t
    ) THEN
      RAISE EXCEPTION 'Deny-listed table public.% is still published to supabase_realtime', _t;
    END IF;
  END LOOP;
END
$$;

-- Replica identity: realtime UPDATE/DELETE payloads need full row images.
DO $$
DECLARE
  _t text;
BEGIN
  FOREACH _t IN ARRAY ARRAY[
    'deals','email_send_log','messages','search_history',
    'user_connections','user_favorites','venue_reviews'
  ] LOOP
    IF to_regclass('public.' || quote_ident(_t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', _t);
    END IF;
  END LOOP;
END
$$;