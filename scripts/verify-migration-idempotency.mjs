#!/usr/bin/env node
/**
 * Migration guardrails.
 *
 * Every NEW migration (anything not listed in
 * scripts/migration-idempotency-baseline.txt) must be:
 *
 *  1. Idempotent — safe to replay:
 *     - CREATE TABLE / INDEX / TYPE / COLUMN     -> IF NOT EXISTS
 *     - CREATE POLICY                            -> preceded by DROP POLICY IF EXISTS
 *     - CREATE TRIGGER                           -> preceded by DROP TRIGGER IF EXISTS
 *     - CREATE FUNCTION                          -> CREATE OR REPLACE FUNCTION
 *     - ALTER PUBLICATION ... ADD/DROP TABLE     -> guarded by a pg_publication_tables check
 *  2. Free of data-mutating statements (UPDATE / DELETE / INSERT / TRUNCATE on
 *     public tables). Those trip the "conflicts with live data" publish gate.
 *     Backfills belong in a one-off admin action instead
 *     (see public.admin_backfill_display_names).
 *
 * Escape hatch: add `-- idempotency-check: allow-dml` on the line above a
 * deliberate seed/DML statement (e.g. literal seed rows for a brand new table).
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const MIGRATIONS_DIR = "supabase/migrations";
const BASELINE = "scripts/migration-idempotency-baseline.txt";

const baseline = new Set(
  existsSync(BASELINE)
    ? readFileSync(BASELINE, "utf8")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
    : [],
);

/** Strip line comments and string/dollar-quoted literals we don't want to scan. */
const stripComments = (sql) =>
  sql
    .split("\n")
    .map((line) => (line.trim().startsWith("--") ? "" : line))
    .join("\n");

const rules = [
  {
    name: "CREATE TABLE without IF NOT EXISTS",
    re: /\bcreate\s+table\s+(?!if\s+not\s+exists)/gi,
    hint: "use CREATE TABLE IF NOT EXISTS",
  },
  {
    name: "CREATE INDEX without IF NOT EXISTS",
    re: /\bcreate\s+(unique\s+)?index\s+(concurrently\s+)?(?!if\s+not\s+exists)/gi,
    hint: "use CREATE INDEX IF NOT EXISTS",
  },
  {
    name: "ADD COLUMN without IF NOT EXISTS",
    re: /\badd\s+column\s+(?!if\s+not\s+exists)/gi,
    hint: "use ADD COLUMN IF NOT EXISTS",
  },
  {
    name: "DROP COLUMN without IF EXISTS",
    re: /\bdrop\s+column\s+(?!if\s+exists)/gi,
    hint: "use DROP COLUMN IF EXISTS",
  },
  {
    name: "CREATE FUNCTION without OR REPLACE",
    re: /\bcreate\s+function\b/gi,
    hint: "use CREATE OR REPLACE FUNCTION",
  },
  {
    name: "CREATE TRIGGER without a preceding DROP TRIGGER IF EXISTS",
    re: /\bcreate\s+(constraint\s+)?trigger\s+(?!if\s+not\s+exists)([a-z0-9_"]+)/gi,
    hint: "add DROP TRIGGER IF EXISTS <name> ON <table>; first",
    guard: (sql, m) =>
      new RegExp(
        `drop\\s+trigger\\s+if\\s+exists\\s+${m[2].replace(/"/g, "")}\\b`,
        "i",
      ).test(sql),
  },
  {
    name: "CREATE POLICY without a preceding DROP POLICY IF EXISTS",
    re: /\bcreate\s+policy\s+("(?:[^"]+)"|'(?:[^']+)'|[a-z0-9_]+)/gi,
    hint: "add DROP POLICY IF EXISTS <name> ON <table>; first",
    guard: (sql, m) => {
      const name = m[1].replace(/^["']|["']$/g, "");
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Accepted form 1: an explicit DROP POLICY IF EXISTS for the same name.
      if (
        new RegExp(
        `drop\\s+policy\\s+if\\s+exists\\s+["']?${name.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&",
        )}["']?`,
        "i",
        ).test(sql)
      ) {
        return true;
      }
      // Accepted form 2: CREATE POLICY guarded by a pg_policies existence check
      // for the same policy name inside a DO $$ ... $$ block.
      return (
        /pg_policies/i.test(sql) &&
        new RegExp(`policyname\\s*=\\s*["']${escaped}["']`, "i").test(sql)
      );
    },
  },
  {
    name: "ALTER PUBLICATION without a pg_publication_tables guard",
    re: /\balter\s+publication\s+\w+\s+(add|drop)\s+table\b/gi,
    hint: "wrap in DO $$ ... IF (NOT) EXISTS (SELECT 1 FROM pg_publication_tables ...) ... $$",
    guard: (sql) => /pg_publication_tables/i.test(sql),
  },
];

const dmlRe =
  /^\s*(update|delete\s+from|insert\s+into|truncate)\s+(?:only\s+)?(public\.|"public"\.)/i;

const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .filter((f) => !baseline.has(f))
  .sort();

const problems = [];

for (const file of files) {
  const raw = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
  const sql = stripComments(raw);

  for (const rule of rules) {
    rule.re.lastIndex = 0;
    let m;
    while ((m = rule.re.exec(sql)) !== null) {
      if (rule.guard && rule.guard(sql, m)) continue;
      problems.push(`${file}: ${rule.name} — ${rule.hint}`);
    }
  }

  // Data-mutating statements outside of function bodies.
  const lines = raw.split("\n");
  // Track dollar-quoted bodies, including named tags such as $function$.
  let openTag = null;
  lines.forEach((line, i) => {
    const inBody = openTag !== null;
    for (const m of line.match(/\$[a-zA-Z_][a-zA-Z0-9_]*\$|\$\$/g) || []) {
      if (openTag === null) openTag = m;
      else if (openTag === m) openTag = null;
    }
    if (inBody) return; // inside a function/DO body — runtime logic, not a migration-time backfill
    if (!dmlRe.test(line)) return;
    if ((lines[i - 1] || "").includes("idempotency-check: allow-dml")) return;
    problems.push(
      `${file}:${i + 1}: data-mutating statement in a migration — ` +
        `move the backfill to a one-off admin action, or annotate the line above ` +
        `with "-- idempotency-check: allow-dml" if it seeds a brand-new table`,
    );
  });
}

if (problems.length) {
  console.error("Migration guardrail failures:\n");
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error(
    `\n${problems.length} problem(s) in ${files.length} new migration file(s).`,
  );
  process.exit(1);
}

console.log(
  `Migration guardrails OK — ${files.length} new migration file(s) checked ` +
    `(${baseline.size} grandfathered).`,
);