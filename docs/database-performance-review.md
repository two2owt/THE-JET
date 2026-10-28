# Database performance review — 2026-10-28

## Recorded usage

Window: October 15, 2026 00:00 UTC through October 28, 2026 10:32 UTC (partial last date).

- Database: 211.82796 requested credits, from 171 recorded XL instance-hours.
- Other running categories combined: about 0.12745 requested credits.
- Building and monitoring: 5.6 requested credits, separate from running usage.

These are requested-credit amounts for recorded usage, not a cash bill or a measured savings result. Environment attribution is unavailable from the usage lookup.

## Runtime evidence

- Database is up; memory 6%, connections 30/240, pool clients 1/1000, disk 30%, database 2.06 GB.
- No recent resource exhaustion alerts. This is a point-in-time snapshot, not sustained capacity evidence for downsizing.
- Largest relation observed through table-size statistics was scheduled-job execution history, about 2.16 GB. No managed history rows or settings were modified; retention and supported maintenance controls need platform diagnostics.
- Public analytics tables are about 9.95 MB and 6.63 MB, far smaller than the execution history.
- Sampled application reads average about 0.09–1.19 ms. The largest returned application read accumulated 184 ms over 259 calls.
- Existing indexes already cover notification receipts `(user_id, created_at DESC)`, consent lookup `(user_id, consent_type, created_at DESC)`, map latency `(stage, created_at DESC)`, and config primary key. Plain EXPLAIN uses small-table sequential scans for receipts and consent; adding redundant indexes is not justified.
- Database statement statistics show 2,057 realtime guard checks accumulating 23.99 seconds and 3,086 latency checks accumulating 13.01 seconds. The statement-statistics reset window is unknown; these are accumulated elapsed times, not CPU or credits.
- Safe schedule inventory and execution-history tools are not available in this session. Source describes a ten-minute map check and wake-on-enqueue nudge dispatch; deployed cadence and idle executions remain unverified.

## Implemented and verified

Notification reads now share simultaneous requests with the same account and query. No settled response caching was added. Token renewal and initial-session events no longer trigger redundant alert reloads; explicit sign-in, sign-out, push events and manual refresh still reload.

Signed-in `/alerts`, same browser procedure before/after:

| Reads on opening | Before | After |
| --- | ---: | ---: |
| notification_logs | 4 | 1 |
| notification_deliveries | 4 | 1 |
| Combined | 8 | 2 |

This is an observed 75% reduction in these reads for the tested opening flow, not a project-wide reduction or credit savings claim. The inbox rendered existing alerts and unread badges. Seventeen tests passed, including coalescing, account isolation, fresh reload, retry after failure, notification read ledger and push preferences. Preview build is OK.

## Next measurements / constraints

- Collect representative peak CPU, memory, connections and latency history before recommending a smaller instance. XL capacity is the largest recorded running driver, but a smaller size is not yet justified by sustained evidence.
- Obtain supported schedule and execution-history diagnostics before changing background cadence or managed history retention. Do not weaken monitoring or change data retention implicitly.
- Compare recorded instance-hours/credits after publishing and billing ingestion before claiming credit savings. No publishing occurred; the user's publishing permission is conditional on preserving the admin alert and finishing the stopped email update.
- Email update remains stopped. Its admin-alert prerequisite and explicit restart consent must be satisfied first; do not publish an incomplete update.