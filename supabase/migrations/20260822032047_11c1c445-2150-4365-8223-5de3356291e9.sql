CREATE OR REPLACE FUNCTION public.check_map_sync_latency()
RETURNS TABLE(opened integer, resolved integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m record;
  th record;
  sev text;
  thr numeric;
  n_open integer := 0;
  n_res integer := 0;
  admin_email text;
  body text;
  is_new boolean;
BEGIN
  IF COALESCE(auth.role(), current_user) NOT IN ('service_role','postgres','supabase_admin')
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  FOR th IN SELECT * FROM public.map_sync_latency_thresholds WHERE enabled LOOP
    SELECT
      count(*) AS samples,
      round(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::numeric, 0) AS p95
    INTO m
    FROM public.map_sync_latency_samples
    WHERE stage = th.stage
      AND created_at > now() - interval '30 minutes';

    CONTINUE WHEN m.samples IS NULL OR m.samples < th.min_samples;

    IF m.p95 >= th.crit_ms THEN sev := 'critical'; thr := th.crit_ms;
    ELSIF m.p95 >= th.warn_ms THEN sev := 'warning'; thr := th.warn_ms;
    ELSE sev := NULL; thr := NULL;
    END IF;

    IF sev IS NULL THEN
      UPDATE public.map_sync_latency_alerts
        SET status = 'resolved', resolved_at = now(), updated_at = now()
        WHERE stage = th.stage AND status = 'open';
      IF FOUND THEN n_res := n_res + 1; END IF;
      CONTINUE;
    END IF;

    is_new := NOT EXISTS (
      SELECT 1 FROM public.map_sync_latency_alerts
      WHERE stage = th.stage AND status = 'open' AND severity = sev
    );

    INSERT INTO public.map_sync_latency_alerts
      (stage, severity, observed_p95_ms, threshold_ms, sample_count, message)
    VALUES (
      th.stage, sev, m.p95, thr, m.samples,
      format('Map sync %s p95 is %sms over the last 30 min (threshold %sms, %s samples)',
             th.stage, m.p95, thr, m.samples)
    )
    ON CONFLICT (stage) WHERE status = 'open'
    DO UPDATE SET severity = EXCLUDED.severity,
                  observed_p95_ms = EXCLUDED.observed_p95_ms,
                  threshold_ms = EXCLUDED.threshold_ms,
                  sample_count = EXCLUDED.sample_count,
                  message = EXCLUDED.message,
                  updated_at = now();
    n_open := n_open + 1;

    IF is_new THEN
      body := format(
        '<h2>JET map sync degradation</h2><p><strong>%s</strong> stage p95 latency is <strong>%sms</strong> over the last 30 minutes (threshold %sms, %s samples).</p><p>Check the Admin dashboard, System section, Map Sync Latency panel.</p>',
        th.stage, m.p95, thr, m.samples
      );
      FOR admin_email IN
        SELECT u.email FROM auth.users u
        JOIN public.user_roles r ON r.user_id = u.id AND r.role = 'admin'::app_role
        WHERE u.email IS NOT NULL
      LOOP
        BEGIN
          PERFORM public.enqueue_email('transactional_emails', jsonb_build_object(
            'to', admin_email,
            'subject', format('[JET] Map sync %s latency %s', th.stage, sev),
            'html', body,
            'label', 'map_sync_latency_alert'
          ));
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'map sync alert email failed: %', SQLERRM;
        END;
      END LOOP;
      UPDATE public.map_sync_latency_alerts
        SET notified_at = now() WHERE stage = th.stage AND status = 'open';
    END IF;
  END LOOP;

  DELETE FROM public.map_sync_latency_samples WHERE created_at < now() - interval '7 days';

  opened := n_open; resolved := n_res;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.check_map_sync_latency() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_map_sync_latency() TO service_role;