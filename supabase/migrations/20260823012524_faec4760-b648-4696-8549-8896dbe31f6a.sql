-- 1. enqueue_email: default from / sender_domain so every producer is safe
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pgmq', 'public'
AS $function$
DECLARE
  p jsonb := COALESCE(payload, '{}'::jsonb);
  mid text;
  default_domain constant text := 'notify.www.jet-around.com';
  default_from   constant text := 'JET <noreply@notify.www.jet-around.com>';
BEGIN
  IF NULLIF(p->>'run_id', '') IS NULL THEN
    mid := COALESCE(NULLIF(p->>'message_id', ''), gen_random_uuid()::text);
    p := p
      || jsonb_build_object('message_id', mid)
      || jsonb_build_object('purpose', COALESCE(NULLIF(p->>'purpose', ''), 'transactional'))
      || jsonb_build_object('idempotency_key',
           COALESCE(NULLIF(p->>'idempotency_key', ''),
                    COALESCE(NULLIF(p->>'label', ''), queue_name) || ':' || mid));
  END IF;

  -- Sender defaults: the queue worker also falls back, but any non-worker
  -- consumer (or a direct Resend call) would otherwise send a payload with no
  -- from/sender_domain and get rejected.
  IF NULLIF(p->>'from', '') IS NULL THEN
    p := p || jsonb_build_object('from', default_from);
  END IF;
  IF NULLIF(p->>'sender_domain', '') IS NULL THEN
    p := p || jsonb_build_object('sender_domain', default_domain);
  END IF;

  IF NULLIF(p->>'queued_at', '') IS NULL THEN
    p := p || jsonb_build_object('queued_at', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  END IF;

  RETURN pgmq.send(queue_name, p);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, p);
END;
$function$;

-- 2. Gate map sync latency alerting on distinct-user volume as well as samples
ALTER TABLE public.map_sync_latency_thresholds
  ADD COLUMN IF NOT EXISTS min_users integer NOT NULL DEFAULT 3;

CREATE OR REPLACE FUNCTION public.check_map_sync_latency()
 RETURNS TABLE(opened integer, resolved integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      count(DISTINCT user_id) AS users,
      round(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::numeric, 0) AS p95
    INTO m
    FROM public.map_sync_latency_samples
    WHERE stage = th.stage
      AND created_at > now() - interval '30 minutes';

    -- Not enough traffic to judge the stage. One or two users can trivially
    -- produce a bad p95 (cold start, backgrounded tab, bad cell signal), so we
    -- require both a sample floor and a distinct-user floor before alerting.
    -- An alert still open with no supporting traffic is stale evidence, so let
    -- it auto-resolve instead of pinning the dashboard to "degraded" forever.
    IF m.samples IS NULL
       OR m.samples < th.min_samples
       OR COALESCE(m.users, 0) < th.min_users THEN
      UPDATE public.map_sync_latency_alerts
        SET status = 'resolved', resolved_at = now(), updated_at = now()
        WHERE stage = th.stage AND status = 'open' AND updated_at < now() - interval '30 minutes';
      IF FOUND THEN n_res := n_res + 1; END IF;
      CONTINUE;
    END IF;

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
      format('Map sync %s p95 is %sms over the last 30 min (threshold %sms, %s samples, %s users)',
             th.stage, m.p95, thr, m.samples, m.users)
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
        '<h2>JET map sync degradation</h2><p><strong>%s</strong> stage p95 latency is <strong>%sms</strong> over the last 30 minutes (threshold %sms, %s samples across %s users).</p><p>Check the Admin dashboard, System section, Map Sync Latency panel.</p>',
        th.stage, m.p95, thr, m.samples, m.users
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
            'label', 'map_sync_latency_alert',
            'purpose', 'transactional',
            'message_id', gen_random_uuid()::text,
            'idempotency_key', format('map-sync-%s-%s-%s-%s',
              th.stage, sev, md5(admin_email), to_char(date_trunc('hour', now()), 'YYYYMMDDHH24'))
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
$function$;

-- 3. email_send_log realtime payloads must not carry full old rows (recipient PII)
ALTER TABLE public.email_send_log REPLICA IDENTITY DEFAULT;