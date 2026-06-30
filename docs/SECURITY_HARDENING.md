# Supabase Security Hardening — Reference

Last updated: 2026-06-30

This document records the exact security posture the project relies on.
Future migrations, policy changes, or edge-function edits MUST preserve
every item below. If you intentionally change one, update this file in
the same PR.

---

## 1. Roles

Standard PostgREST role triad:

| Role            | Used by                        | Notes                                                  |
| --------------- | ------------------------------ | ------------------------------------------------------ |
| `anon`          | Unauthenticated HTTP requests  | Must NEVER receive `EXECUTE` on `SECURITY DEFINER` fns |
| `authenticated` | Logged-in users (Supabase JWT) | Default grantee for user-owned tables                  |
| `service_role`  | Edge functions, admin scripts  | Bypasses RLS; required on every public table           |

Application roles live in `public.user_roles` keyed by the
`public.app_role` enum (`admin`, `moderator`, `user`). Roles are
**never** stored on `profiles` or any other table — privilege
escalation risk.

Admin checks always go through `public.has_role(_user_id, _role)`
(`SECURITY DEFINER`, `STABLE`, `search_path = public`).

---

## 2. Grants — invariants

For every table in the `public` schema, in this exact order:

1. `CREATE TABLE public.<name> (...)`
2. `GRANT` to the roles that policies allow
3. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
4. `CREATE POLICY ...`

Default grant block for a user-owned table:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table> TO authenticated;
GRANT ALL ON public.<table> TO service_role;
-- Only add: GRANT SELECT ON public.<table> TO anon;  -- if a policy allows anon reads
```

`user_roles` is auth-only (read via `has_role`); do NOT grant `anon`.

### Functions

All `SECURITY DEFINER` functions in `public` must:

- Set `search_path = public` explicitly.
- REVOKE `EXECUTE` from `PUBLIC` and `anon`.
- GRANT `EXECUTE` only to the role(s) that need it (usually
  `authenticated`, plus `service_role` for edge-function callers).

Template after creating/altering such a function:

```sql
REVOKE EXECUTE ON FUNCTION public.<fn>(<args>) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.<fn>(<args>) TO authenticated, service_role;
```

Definer functions currently following this rule: `has_role`,
`handle_new_user`, `assign_admin_role_if_authorized`,
`check_connection_rate_limit`, `can_view_profile_field`,
`obfuscate_coordinates`, `process_location_data_retention`,
`cleanup_old_search_history`, `cleanup_old_security_audit_logs`,
`dispatch_ending_soon_favorites`, `invoke_favorite_update_notify`,
`notify_favorite_deal_change`, `notify_admin_of_new_deal`,
`enqueue_email`, `delete_email`, `read_email_batch`, `move_to_dlq`,
`update_updated_at_column`.

---

## 3. Views

All views in `public` MUST be created with `security_invoker = on`:

```sql
CREATE VIEW public.<view> WITH (security_invoker = on) AS ...;
-- or
ALTER VIEW public.<view> SET (security_invoker = on);
```

Currently enforced for `discoverable_profiles` (which additionally
requires `discoverable IS TRUE`). Without `security_invoker` a view
runs as its owner and bypasses RLS on the underlying tables — the
classic "Security Definer View" finding, treated as a regression.

---

## 4. RLS policies — patterns we rely on

- `profiles` is NOT publicly readable. Field-level visibility is gated
  by `public.can_view_profile_field(profile_id, viewer_id, field)`
  plus owner-only fallback.
- `user_favorites`, `user_preferences`, `user_locations`, `messages`,
  `push_subscriptions`, `search_history`, `notification_logs`,
  `venue_reviews`, `user_consents` are all scoped to
  `auth.uid() = user_id`.
- `deals` is readable by `authenticated` when `active = true`; writes
  are admin-only via `public.has_role(auth.uid(), 'admin')`.
- `user_roles` reads are restricted; role mutations are admin-only.
- `security_audit_logs` is `service_role`-only.
- `admin_security_findings*` are admin-only via `has_role`.

Any new policy that uses `anon` must be justified inline in the
migration description and reflected in §2.

---

## 5. Storage buckets

| Bucket            | Public | Notes                                                            |
| ----------------- | ------ | ---------------------------------------------------------------- |
| `avatars`         | Yes    | Public profile/deal images.                                      |
| `deal-images`     | Yes    | Public deal hero images.                                         |
| `chat-images`     | No     | **No** anonymous SELECT policy. Authenticated participants only. |
| `profile-avatars` | No     | Owner-only read/write.                                           |

`chat-images` explicitly does NOT have an
`"Anyone can view chat images"` policy. Do not re-add it — chat
images contain private DM content. Unauthenticated `GET` on a
`chat-images` object must return `400/403`.

---

## 6. Realtime publication

`supabase_realtime` MUST NOT include any of:

- `public.user_locations`
- `public.profiles`
- `public.messages` (broadcast via app channels, not table publication)
- `public.user_consents`, `public.security_audit_logs`,
  `public.push_subscriptions`

Tables intentionally published:

- `public.user_favorites` (with `REPLICA IDENTITY FULL`) — drives
  cross-device heart-toggle sync.
- `public.deals` — drives live deal activation in the UI.

If a new table is added to realtime, document why here and confirm
RLS still filters the change feed for `anon`/`authenticated`.

---

## 7. Edge functions

All Deno edge functions in `supabase/functions/*` MUST:

1. Verify the caller. Two acceptable patterns:
   - User-context: read `Authorization: Bearer <jwt>`, call
     `supabase.auth.getUser(token)`, reject on error.
   - Server-to-server (webhooks, cron): require an `x-webhook-secret`
     header matching `JETBRIDGE_WEBHOOK_SECRET` or
     `NOTIFY_ADMIN_HOOK_SECRET`.
2. Construct a fresh `service_role` client only after auth passes.
3. Return generic `{ "error": "Internal server error" }` on `500` —
   never leak stack traces or upstream provider messages.
4. Honor CORS via the shared `corsHeaders` helper.
5. Never log secrets, JWTs, or request bodies containing PII.

Admin-only functions (`admin-*`, `generate-deal-image`,
`merchant-send-notification`, `notify-admin-new-deal`, …) must
additionally call `rpc('has_role', { _user_id, _role: 'admin' })`
on a service-role client before privileged work.

Public-by-design analytics functions (`get-location-density`,
`get-movement-paths`, `search-google-places-venues`,
`scrape-venue-images`) currently require authentication. Any move
back to anonymous access must be paired with IP rate-limiting and a
finding-level review.

---

## 8. Auth configuration

- Leaked password protection (HIBP) is **enabled**
  (`password_hibp_enabled = true`). Do not disable.
- Minimum age 21 enforced via the `enforce_minimum_age` trigger on
  `profiles.birthdate`.
- No anonymous sign-ups.
- Email confirmation required unless the user explicitly opts out.
- Google OAuth `redirect_uri` must be `${window.location.origin}` —
  never a protected app route, and never include tokens in the redirect.

---

## 9. Client-side rules

- Never check admin status from `localStorage`, `sessionStorage`,
  cookies, or hard-coded emails. Always round-trip through
  `public.has_role` (see `src/hooks/useIsAdmin.ts`).
- Never edit `src/integrations/supabase/client.ts` or
  `src/integrations/supabase/types.ts` — both are generated.
- Publishable/anon keys are OK in client code; service-role keys,
  webhook secrets, and provider API keys must stay in Supabase
  secrets and only be read inside edge functions.

---

## 10. Regression checklist (run before merging schema changes)

- [ ] Every new `public` table has explicit `GRANT`s and RLS enabled.
- [ ] Every new `SECURITY DEFINER` function REVOKEs `EXECUTE` from
      `PUBLIC, anon` and grants only required roles.
- [ ] Every new view uses `security_invoker = on`.
- [ ] `supabase--linter` returns no new errors.
- [ ] `chat-images` bucket still has no public SELECT policy.
- [ ] Realtime publication still excludes the tables in §6.
- [ ] HIBP password protection still enabled.
- [ ] Edge functions added in the PR enforce auth as described in §7.

---

## 11. CI enforcement

`scripts/verify-security-hardening.mjs` statically replays every file in
`supabase/migrations/` and enforces the invariants in §2, §3, §5, and §6
against this document. It runs automatically on every PR that touches
migrations or this doc via `.github/workflows/security-hardening.yml`, and
can be run locally with:

```bash
npm run verify:security
```

The script fails the build when a new migration:

- creates a `public` table without `GRANT`s, RLS, or any policy,
- defines a `SECURITY DEFINER` function in `public` without REVOKEing
  `EXECUTE` from `PUBLIC`/`anon`,
- creates or alters a view in `public` without `security_invoker = on`,
- re-introduces the `"Anyone can view chat images"` policy, or
- adds any table from §6 back to the `supabase_realtime` publication.

Pre-existing violations are pinned in
`scripts/security-hardening-baseline.txt` so the check fails only on new
regressions. If you intentionally accept a new baseline entry (rare —
prefer fixing the migration), run
`node scripts/verify-security-hardening.mjs --update-baseline` and commit
the updated file along with the justification in this document.
