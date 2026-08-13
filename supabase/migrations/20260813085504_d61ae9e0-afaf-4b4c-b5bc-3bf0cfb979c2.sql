DO $$
BEGIN
  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "Users can join their own realtime channel" ON realtime.messages';
    EXECUTE $p$CREATE POLICY "Users can join their own realtime channel"
      ON realtime.messages
      FOR SELECT
      TO authenticated
      USING (realtime.topic() = 'user:' || auth.uid()::text)$p$;

    EXECUTE 'DROP POLICY IF EXISTS "Users can broadcast on their own realtime channel" ON realtime.messages';
    EXECUTE $p$CREATE POLICY "Users can broadcast on their own realtime channel"
      ON realtime.messages
      FOR INSERT
      TO authenticated
      WITH CHECK (realtime.topic() = 'user:' || auth.uid()::text)$p$;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'skipping realtime.messages policies: insufficient privilege';
  END;
END $$;