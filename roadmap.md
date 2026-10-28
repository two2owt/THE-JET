# Tasks

- [x] Measure database performance and recorded running usage; reduce verified duplicate notification reads and validate results.
- [ ] Evaluate database downsizing and managed execution-history cleanup — blocked on sustained load history and supported schedule/history controls.
- [ ] Fix activation-email cooldowns being applied before successful sends — bulk re-engagement sending is not supported by the app-email rules; do not extend that sender.
- [ ] Move admin map-sync alert sending into the app and verify continuity before restarting the email update — pending the canceled email-update consent decision.
- [ ] Restart the stopped email update and publish after its prerequisites — blocked on restart consent, alert continuity and a completed update for review.