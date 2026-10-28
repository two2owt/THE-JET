# Tasks

- [ ] Build in-app JET Bridge business submission, approval, venue/deal management and map publishing — blocked on business-verification connection; Middesk was declined, so do not retry without a new request.
- [x] Measure database performance and recorded running usage; reduce verified duplicate notification reads and validate results.
- [x] Refresh database measurements after the repeated optimization request; reuse the verified query/index investigation without changing capacity or monitoring cadence.
- [ ] Evaluate database downsizing and managed execution-history cleanup — blocked on sustained load history and supported schedule/history controls.
- [ ] Fix activation-email cooldowns being applied before successful sends — bulk re-engagement sending is not supported by the app-email rules; do not extend that sender.
- [ ] Move admin map-sync alert sending into the app and verify continuity before restarting the email update — pending the canceled email-update consent decision.
- [ ] Restart the stopped email update and publish after its prerequisites — blocked on restart consent, alert continuity and a completed update for review.