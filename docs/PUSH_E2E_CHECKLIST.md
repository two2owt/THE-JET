# Live Push — End-to-End Verification Checklist

Run this against **Live** (`www.jet-around.com`) with a real phone/desktop test device.
Each step lists the action, the expected result, and how to prove it. Stop at the first
failure — later steps depend on earlier ones.

---

## Phase 0 — Live backend readiness (do this first)

| # | Check | How to verify | Pass condition |
|---|---|---|---|
| 0.1 | `get-vapid-key` deployed to Live | `curl -s -X POST https://<live-ref>.supabase.co/functions/v1/get-vapid-key` | 200 with `{"publicKey":"B..."}`, not 404 |
| 0.2 | VAPID pair present in Live secrets | Backend → Secrets | `VITE_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` both set, and the public key matches 0.1 |
| 0.3 | Notification schema exists in Live | Query Live: `select to_regclass('public.notification_queue'), to_regclass('public.notification_deliveries'), to_regclass('public.push_subscriptions')` | All three non-null |
| 0.4 | `claim_push_subscription` RPC exists in Live | Query Live: `select proname from pg_proc where proname = 'claim_push_subscription'` | One row |
| 0.5 | Unique index on endpoint | Query Live: `select indexname from pg_indexes where tablename='push_subscriptions'` | `push_subscriptions_endpoint_key` present |
| 0.6 | Dispatch worker scheduled | Query Live: `select jobname, schedule, active from cron.job` | `process-notification-queue` active |
| 0.7 | Native push credential (only if testing the store build) | Backend → Secrets | `FCM_SERVICE_ACCOUNT_JSON` set |
| 0.8 | Frontend points at Live | View source of `www.jet-around.com`, search the bundle for the project ref | Live ref, not the Test ref |

---

## Phase 1 — Permission prompt (test device)

1. Open `https://www.jet-around.com` on the test device in a **fresh** profile
   (or reset site permissions: Site settings → Notifications → Reset).
   - iOS Safari only supports web push from a **home-screen install**: Share → Add to Home Screen, then open that icon.
2. Sign in with the test account.
3. Confirm the app does **not** call `Notification.requestPermission()` on load.
   - Expected: no OS prompt until you tap something.
4. Tap **Enable Alerts** (Notifications header on the Hot/Alerts tab) or Settings → Notifications → Push Notifications toggle.
5. Expected: the browser's native permission dialog appears. Tap **Allow**.
6. Expected: success toast, and the toggle stays on after a page reload.

**Fails to prompt?** Check `Notification.permission` in the console. If it is already
`denied`, the guide card in Settings should tell you how to unblock it in browser settings.

---

## Phase 2 — Subscription is stored against the user

7. Query Live:
   ```sql
   select user_id, platform, active, left(endpoint, 40) as endpoint, updated_at
   from public.push_subscriptions
   order by updated_at desc
   limit 5;
   ```
   Expected: a fresh row for the test user, `active = true`, `platform = 'web'`
   (or `ios`/`android` for the native build).
8. Reload the page and refresh the auth token (leave the tab idle or sign out/in).
   Expected: still exactly **one** row for that endpoint — no duplicates, `active` unchanged.
9. Consent row recorded:
   ```sql
   select consent_type, granted, source, created_at
   from public.user_consents
   where user_id = '<test-user-id>' and consent_type = 'push_notifications'
   order by created_at desc limit 3;
   ```
   Expected: newest row `granted = true`.

---

## Phase 3 — Receiving a notification (backgrounded app)

10. Sign in as an admin, open **/admin → Notifications → Send test push**.
11. Choose **User**, paste the test user's UUID, keep the default title/body, set URL to `/`.
12. Put the test device's browser in the background (lock the phone or switch apps).
13. Tap **Send**. Expected admin toast: `Sent 1/1 push notifications`, `0 failed`.
14. Expected on the device: an OS notification banner with the JET icon within ~10s.
15. Tap the notification. Expected: the app opens (or focuses) at the URL from step 11.

---

## Phase 4 — Foreground delivery

16. Bring the app to the foreground and leave it visible.
17. Send another test push.
18. Expected: **no** duplicate OS banner; instead an in-app toast with a **View** action.
19. Tap **View**. Expected: routes to the deep link target.

---

## Phase 5 — Alerts inbox

20. Open the **Alerts** tab.
21. Expected: both test notifications appear, newest first, marked unread.
22. Expected: the bottom-nav Alerts badge shows the unread count.
23. Tap one. Expected: it marks read, the badge decrements, and the count survives a reload.
24. Tap **Mark all read**. Expected: badge disappears.

---

## Phase 6 — Real merchant path (not just the test panel)

25. In the JET merchant portal, activate a deal for a venue the test user has favorited.
26. Query Live:
    ```sql
    select event_type, audience, status, attempts, stats, created_at
    from public.notification_queue
    order by created_at desc limit 5;
    ```
    Expected: a new row that moves `pending → processing → sent` within one worker cycle.
27. Query deliveries:
    ```sql
    select channel, status, error, created_at
    from public.notification_deliveries
    order by created_at desc limit 10;
    ```
    Expected: a `sent` row for the test user's subscription, no `error`.
28. Expected on the device: the deal notification arrives and deep-links to that deal.

---

## Phase 7 — Opt-out must stick

29. Settings → Notifications → turn the push toggle **off**.
30. Expected: `push_subscriptions.active = false` for that endpoint, and a
    `push_notifications` consent row with `granted = false`.
31. Reload the page several times and wait for a token refresh.
    Expected: the row stays `active = false` — the background sync must not re-subscribe.
32. Send another admin test push to that user.
    Expected: `Sent 0/…` — nothing arrives on the device.
33. Re-enable the toggle. Expected: subscription returns to `active = true` and delivery resumes.

---

## Phase 8 — Failure handling

34. Simulate a dead endpoint: manually corrupt one test row's `endpoint`, then send a push.
    Expected: delivery records an error, the worker does not retry forever
    (`attempts` stops at `max_attempts`), and the stale subscription is deactivated.
35. Confirm nothing is stuck:
    ```sql
    select status, count(*) from public.notification_queue group by status;
    ```
    Expected: no rows sitting in `processing` older than 5 minutes.

---

## Sign-off

Push is confirmed working on Live when **Phases 1–7 all pass on a real device**, with
the queue row in Phase 6 reaching `sent` and the opt-out in Phase 7 surviving a reload.
Record the device, OS version, browser, and date next to each run.
