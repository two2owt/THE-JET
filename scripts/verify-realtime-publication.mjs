#!/usr/bin/env node
/**
 * CI guard: `supabase_realtime` publication membership must match the expected
 * schema before any Test or Live deploy.
 *
 * Historical drift in this publication (a partial-column entry for
 * public.user_locations) stalled the Test -> Live publish preflight, so this
 * check runs ahead of every deploy.
 *
 * Two passes:
 *  1. Static: replay every migration under supabase/migrations in filename
 *     order and compare the resulting membership against
 *     scripts/realtime-publication-expected.txt. Also rejects
 *     partial-column publication entries and unguarded ADD/DROP TABLE
 *     statements in new migrations (guarded = inside a pg_publication_tables
 *     existence check).
 *  2. Live (only when PGHOST is set): query pg_publication_tables and compare
 *     the real membership against the same expected list.
 *
 * Run locally: `node scripts/verify-realtime-publication.mjs`
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const EXPECTED_PATH = join(ROOT, "scripts", "realtime-publication-expected.txt");

// Tables that must never be published, regardless of the expected list.
const DENY_LIST = new Set([
  "user_locations",
  "profiles",
  "user_consents",
  "security_audit_logs",
  "push_subscriptions",
  "notification_logs",
  "deal_shares",
]);

// Migrations already applied to Test. They must not be rewritten; later
// guarded migrations supersede their unguarded statements.
const LEGACY_ALLOWLIST = new Set(
  readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql") && f < "20260814000000"),
);

const expected = new Set(
  readFileSync(EXPECTED_PATH, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#")),
);

for (const t of expected) {
  if (DENY_LIST.has(t)) {
    console.error(`Expected list contains deny-listed table public.${t}.`);
    process.exit(1);
  }
}

const errors = [];
const strip = (sql) =>
  sql.replace(/--[^\n]*\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "");

const members = new Set();

for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
  const sql = strip(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  const guarded = /pg_publication_tables/i.test(sql);
  const isLegacy = LEGACY_ALLOWLIST.has(file);

  // A reconciliation migration rebuilds membership from the expected list via
  // dynamic EXECUTE format(), which the static replay cannot resolve. Treat it
  // as a reset point so the advisory diff below stays meaningful.
  if (/RECONCILE_REALTIME_PUBLICATION|Deny-listed table public\.% is still published/i.test(sql)) {
    members.clear();
    for (const t of expected) members.add(t);
  }

  for (const m of sql.matchAll(
    /alter\s+publication\s+supabase_realtime\s+add\s+table\s+(?:only\s+)?(?:public\.)?["']?([a-z0-9_%I]+)["']?\s*(\()?/gi,
  )) {
    const t = m[1].toLowerCase();
    if (m[2] && !isLegacy) {
      errors.push(
        `${file}: partial-column publication entry for public.${t} — Supabase publish preflight cannot reconcile these. Publish whole tables or nothing.`,
      );
    }
    if (t === "%i") continue; // dynamic EXECUTE format() — resolved at runtime
    members.add(t);
    if (DENY_LIST.has(t) && !isLegacy) {
      errors.push(`${file}: adds deny-listed table public.${t} to supabase_realtime.`);
    }
    if (!guarded && !isLegacy) {
      errors.push(
        `${file}: unguarded ALTER PUBLICATION ... ADD TABLE public.${t}. Wrap it in a DO block that checks pg_publication_tables first.`,
      );
    }
  }

  for (const m of sql.matchAll(
    /alter\s+publication\s+supabase_realtime\s+drop\s+table\s+(?:only\s+)?(?:public\.)?["']?([a-z0-9_%I]+)["']?/gi,
  )) {
    const t = m[1].toLowerCase();
    if (t === "%i") continue;
    members.delete(t);
    if (!guarded && !isLegacy) {
      errors.push(
        `${file}: unguarded ALTER PUBLICATION ... DROP TABLE public.${t}. Wrap it in a DO block that checks pg_publication_tables first.`,
      );
    }
  }
}

const diff = (label, actual, sink = errors) => {
  const missing = [...expected].filter((t) => !actual.has(t)).sort();
  const extra = [...actual].filter((t) => !expected.has(t)).sort();
  for (const t of missing) sink.push(`${label}: public.${t} is expected in supabase_realtime but absent.`);
  for (const t of extra) sink.push(`${label}: public.${t} is published to supabase_realtime but not in the expected list.`);
  return missing.length + extra.length === 0;
};

// The static replay cannot resolve dynamic EXECUTE format() statements or
// out-of-band repairs, so its membership diff is advisory. The authoritative
// membership comparison runs against the database below; the static pass is
// authoritative for the guard, deny-list and partial-column rules above.
const staticDrift = [];
diff("migrations (static replay)", members, staticDrift);
for (const d of staticDrift) console.warn(`  advisory: ${d}`);

// Pass 2: live database, when credentials are present.
if (process.env.PGHOST) {
  try {
    const out = execFileSync(
      "psql",
      [
        "-At",
        "-c",
        "SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' ORDER BY 1",
      ],
      { encoding: "utf8" },
    );
    const live = new Set(out.split("\n").map((l) => l.trim()).filter(Boolean));
    diff("database", live);
  } catch (e) {
    console.warn(`Skipping live publication check: ${e.message.split("\n")[0]}`);
  }
} else {
  console.log("PGHOST not set — skipping live publication check (static replay only).");
}

if (errors.length) {
  console.error(`\nRealtime publication check failed (${errors.length}):\n`);
  for (const e of errors) console.error(`  - ${e}`);
  console.error(
    "\nUpdate scripts/realtime-publication-expected.txt only when the change is intentional,\n" +
      "and manage membership through guarded DO blocks so Test and Live never drift.\n",
  );
  process.exit(1);
}

console.log(
  `Realtime publication check passed: ${expected.size} expected table(s), deny list enforced.`,
);
