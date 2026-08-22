-- idempotency-check: allow-dml
-- Purge end-to-end freshness samples that measured idle/stale data rather than
-- real sync lag (anything beyond the 5 minute freshness window the client now
-- enforces), then re-evaluate the alerting rollup.
-- idempotency-check: allow-dml
DELETE FROM public.map_sync_latency_samples
WHERE stage = 'end_to_end'
  AND latency_ms > 300000;

SELECT public.check_map_sync_latency();