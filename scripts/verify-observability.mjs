#!/usr/bin/env node
/**
 * Guard against shipping a production build with crash reporting disabled.
 *
 * A Sentry DSN is a publishable credential, so JET keeps its project DSN in
 * `src/lib/sentry.ts` as the default. `VITE_SENTRY_DSN` remains an optional
 * override for forks and alternate environments. This check passes when either
 * source yields a well-formed DSN and fails when neither does.
 */

import { readFileSync } from "node:fs";

const DSN_SHAPE = /^https:\/\/[^@]+@[^/]+\/\d+$/;

const envDsn = (process.env.VITE_SENTRY_DSN ?? "").trim();

let sourceDsn = "";
try {
  const src = readFileSync(new URL("../src/lib/sentry.ts", import.meta.url), "utf8");
  sourceDsn = (src.match(/"(https:\/\/[^"@]+@[^"/]+\/\d+)"/)?.[1] ?? "").trim();
} catch {
  /* handled below */
}

if (envDsn && !DSN_SHAPE.test(envDsn)) {
  console.error(
    "\n[observability] ERROR: VITE_SENTRY_DSN is set but does not look like a " +
      "Sentry DSN (expected https://<key>@<host>/<projectId>).\n",
  );
  process.exit(1);
}

const effective = envDsn || sourceDsn;

if (!DSN_SHAPE.test(effective)) {
  console.error(
    "\n[observability] ERROR: no usable Sentry DSN. This build would ship with " +
      "crash reporting DISABLED. Restore the default DSN in src/lib/sentry.ts " +
      "or set VITE_SENTRY_DSN in the build environment.\n",
  );
  process.exit(1);
}

console.log(
  `[observability] Sentry DSN present and well-formed (source: ${
    envDsn ? "VITE_SENTRY_DSN" : "src/lib/sentry.ts default"
  }).`,
);
