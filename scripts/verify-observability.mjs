#!/usr/bin/env node
/**
 * Guard against shipping a production build with crash reporting disabled.
 *
 * `VITE_SENTRY_DSN` is inlined at build time. When it is absent, Sentry
 * silently no-ops and the first bad release is invisible until users churn —
 * exactly the failure mode this check exists to prevent.
 *
 * Advisory by default (warns, exit 0). Set OBSERVABILITY_STRICT=true — CI does
 * this on `main` — to fail the job instead.
 */

const dsn = (process.env.VITE_SENTRY_DSN ?? "").trim();
const strict = /^(1|true|yes)$/i.test(process.env.OBSERVABILITY_STRICT ?? "");

if (!dsn) {
  const message =
    "VITE_SENTRY_DSN is not set. This build will ship with crash reporting DISABLED.\n" +
    "Add the DSN to the build environment (repo secret `VITE_SENTRY_DSN`).";
  if (strict) {
    console.error(`\n[observability] ERROR: ${message}\n`);
    process.exit(1);
  }
  console.warn(`\n[observability] WARNING: ${message}\n`);
  process.exit(0);
}

if (!/^https:\/\/[^@]+@[^/]+\/\d+$/.test(dsn)) {
  console.error(
    "\n[observability] ERROR: VITE_SENTRY_DSN does not look like a Sentry DSN " +
      "(expected https://<key>@<host>/<projectId>).\n",
  );
  process.exit(1);
}

console.log("[observability] VITE_SENTRY_DSN present and well-formed.");
