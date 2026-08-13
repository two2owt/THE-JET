DO $reconcile$
DECLARE
  expected_tables constant text[] := ARRAY[
    'deals',
    'email_send_log',
    'messages',
    'search_history',
    'user_connections',
    'user_favorites',
    'venue_reviews'
  ];
  table_name text;
  actual_tables text[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    RAISE EXCEPTION 'Required publication supabase_realtime does not exist';
  END IF;

  FOR table_name IN
    SELECT DISTINCT publication_table.tablename
    FROM pg_catalog.pg_publication_tables AS publication_table
    WHERE publication_table.pubname = 'supabase_realtime'
      AND publication_table.schemaname = 'public'
      AND NOT (publication_table.tablename = ANY (expected_tables))
  LOOP
    EXECUTE format(
      'ALTER PUBLICATION supabase_realtime DROP TABLE public.%I',
      table_name
    );
  END LOOP;

  FOREACH table_name IN ARRAY expected_tables LOOP
    IF to_regclass(format('public.%I', table_name)) IS NULL THEN
      RAISE EXCEPTION 'Expected realtime table public.% does not exist', table_name;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_publication_tables AS publication_table
      WHERE publication_table.pubname = 'supabase_realtime'
        AND publication_table.schemaname = 'public'
        AND publication_table.tablename = table_name
    ) THEN
      EXECUTE format(
        'ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',
        table_name
      );
    END IF;
  END LOOP;

  SELECT array_agg(publication_table.tablename ORDER BY publication_table.tablename)
  INTO actual_tables
  FROM pg_catalog.pg_publication_tables AS publication_table
  WHERE publication_table.pubname = 'supabase_realtime'
    AND publication_table.schemaname = 'public';

  IF actual_tables IS DISTINCT FROM expected_tables THEN
    RAISE EXCEPTION
      'Realtime publication reconciliation failed. Expected %, found %',
      expected_tables,
      actual_tables;
  END IF;
END
$reconcile$;