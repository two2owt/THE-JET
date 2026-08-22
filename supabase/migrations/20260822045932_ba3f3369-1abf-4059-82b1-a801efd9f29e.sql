-- idempotency-check: allow-dml
DELETE FROM public.map_sync_latency_samples
WHERE stage = 'end_to_end' AND latency_ms > 45000;

SELECT public.check_map_sync_latency();