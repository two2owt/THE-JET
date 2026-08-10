CREATE POLICY "Users view queue rows delivered to them"
ON public.notification_queue
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.notification_deliveries d
  WHERE d.queue_id = notification_queue.id
    AND d.user_id = auth.uid()
));

GRANT SELECT ON public.notification_queue TO authenticated;

CREATE POLICY "Users mark own deliveries opened"
ON public.notification_deliveries
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

GRANT SELECT, UPDATE ON public.notification_deliveries TO authenticated;