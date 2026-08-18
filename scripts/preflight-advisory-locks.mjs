#!/usr/bin/env node
/**
 * Migration preflight: reject invalid pg_advisory_xact_lock signatures.
 *
 * Postgres only provides:
 *   pg_advisory_xact_lock(bigint)
 *   pg_advisory_xact_lock(integer, integer)
 *
 * A two-argument call whose first argument is a bigint expression such as
 * hashtext()/hashtextextended() does not resolve and raises 42883 the first
 * time the function runs — which previously stalled a Live deploy.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = "supabase/migrations";

// Historical migrations already applied to Test. They must not be rewritten;
// the bad definition is superseded by a later CREATE OR REPLACE repair.
const LEGACY_ALLOWLIST = new Set([
  "20260801154649_c70a3458-e107-4709-8ec7-538bca37b565.sql",
]);

const INVALID_CALL =
  /pg_advisory_(xact_)?lock(_shared)?\s*\(\s*(pg_catalog\.)?hashtext(extended)?\s*\([^()]*\)\s*,/i;

const failures = [];

for (const file of readdirSync(MIGRATIONS_DIR).sort()) {
  if (!file.endsWith(".sql") || LEGACY_ALLOWLIST.has(file)) continue;
  const lines = readFileSync(join(MIGRATIONS_DIR, file), "utf8").split("\n");
  lines.forEach((line, i) => {
    if (line.trimStart().startsWith("--")) return;
    if (INVALID_CALL.test(line)) {
      failures.push(`${MIGRATIONS_DIR}/${file}:${i + 1}: ${line.trim()}`);
    }
  });
}

if (failures.length > 0) {
  console.error(
    "Migration preflight failed: invalid advisory-lock signature.\n",
  );
  for (const f of failures) console.error(`  ${f}`);
  console.error(
    "\nUse the single-bigint form instead, e.g.\n" +
      "  PERFORM pg_catalog.pg_advisory_xact_lock(\n" +
      "    pg_catalog.hashtextextended('scope:' || _user_id::text, 0)\n" +
      "  );",
  );
  process.exit(1);
}

console.log(
  "Advisory-lock preflight passed: all advisory lock calls are valid.",
);
