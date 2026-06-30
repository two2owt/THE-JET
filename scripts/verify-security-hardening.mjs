#!/usr/bin/env node
/**
 * Verifies the Supabase security invariants documented in
 * docs/SECURITY_HARDENING.md by statically replaying every migration
 * under supabase/migrations in filename order.
 *
 * Checks (fail = non-zero exit):
 *  1. Every CREATE TABLE public.<t> ends up with:
 *       - at least one GRANT ... ON public.<t> TO <role>
 *       - ALTER TABLE public.<t> ENABLE ROW LEVEL SECURITY
 *       - at least one CREATE POLICY ... ON public.<t>
 *     (satisfied by the same or a later migration; DROP TABLE clears state).
 *  2. Every CREATE [OR REPLACE] FUNCTION public.<fn> ... SECURITY DEFINER
 *     has a matching REVOKE EXECUTE ON FUNCTION public.<fn> FROM
 *     (PUBLIC|anon) somewhere in the migration history.
 *  3. Every CREATE VIEW public.<v> is created or altered with
 *     security_invoker = on (inline WITH (...) or ALTER VIEW ... SET).
 *  4. The chat-images bucket never re-introduces an
 *     "Anyone can view chat images" SELECT policy.
 *  5. supabase_realtime publication never ends up containing any of:
 *       user_locations, profiles, messages, user_consents,
 *       security_audit_logs, push_subscriptions.
 *
 * Run locally: `node scripts/verify-security-hardening.mjs`
 * Used by CI in .github/workflows/security-hardening.yml.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const DOC_PATH = join(ROOT, "docs", "SECURITY_HARDENING.md");

const FORBIDDEN_REALTIME_TABLES = [
  "user_locations",
  "profiles",
  "messages",
  "user_consents",
  "security_audit_logs",
  "push_subscriptions",
];

const errors = [];
const warn = (msg) => errors.push(msg);

if (!existsSync(DOC_PATH)) {
  console.error(`Missing reference doc: ${DOC_PATH}`);
  process.exit(2);
}

if (!existsSync(MIGRATIONS_DIR)) {
  console.log("No supabase/migrations directory — nothing to verify.");
  process.exit(0);
}

const migrationFiles = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

/**
 * Strip SQL comments + dollar-quoted bodies (we don't need them for the
 * invariants we check, and they otherwise confuse cheap regex passes).
 */
function normalize(sql) {
  return sql
    .replace(/--[^\n]*\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\$\$[\s\S]*?\$\$/g, "$$BODY$$");
}

// Aggregate state across migrations.
const tables = new Map(); // name -> { grants, rls, policies, createdIn }
const definerFns = new Map(); // fn name -> { createdIn, revoked }
const views = new Map(); // name -> { invoker, createdIn }
const realtimeTables = new Set();
let chatImagesPublicPolicy = false;

function ensureTable(name, file) {
  if (!tables.has(name)) {
    tables.set(name, {
      grants: false,
      rls: false,
      policies: false,
      createdIn: file,
    });
  }
  return tables.get(name);
}

for (const file of migrationFiles) {
  const raw = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
  const sql = normalize(raw);

  // CREATE TABLE public.<t>
  for (const m of sql.matchAll(
    /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z0-9_]+)/gi,
  )) {
    ensureTable(m[1].toLowerCase(), file);
  }

  // DROP TABLE public.<t> — clear state.
  for (const m of sql.matchAll(
    /drop\s+table\s+(?:if\s+exists\s+)?public\.([a-z0-9_]+)/gi,
  )) {
    tables.delete(m[1].toLowerCase());
  }

  // GRANT ... ON public.<t> TO <role>
  for (const m of sql.matchAll(
    /grant\s+[^;]*?\bon\s+(?:table\s+)?public\.([a-z0-9_]+)\s+to\s+/gi,
  )) {
    const t = m[1].toLowerCase();
    if (tables.has(t)) tables.get(t).grants = true;
  }

  // ALTER TABLE public.<t> ENABLE ROW LEVEL SECURITY
  for (const m of sql.matchAll(
    /alter\s+table\s+(?:only\s+)?public\.([a-z0-9_]+)\s+enable\s+row\s+level\s+security/gi,
  )) {
    const t = m[1].toLowerCase();
    if (tables.has(t)) tables.get(t).rls = true;
  }

  // CREATE POLICY ... ON public.<t>
  for (const m of sql.matchAll(
    /create\s+policy\s+[^;]*?\bon\s+public\.([a-z0-9_]+)/gi,
  )) {
    const t = m[1].toLowerCase();
    if (tables.has(t)) tables.get(t).policies = true;
  }

  // CREATE [OR REPLACE] FUNCTION public.<fn>(...) ... SECURITY DEFINER
  for (const m of sql.matchAll(
    /create\s+(?:or\s+replace\s+)?function\s+public\.([a-z0-9_]+)\s*\(([^)]*)\)[\s\S]*?security\s+definer/gi,
  )) {
    const fn = m[1].toLowerCase();
    if (!definerFns.has(fn)) {
      definerFns.set(fn, { createdIn: file, revoked: false });
    }
  }

  // REVOKE EXECUTE ON FUNCTION public.<fn>(...) FROM (PUBLIC|anon)
  for (const m of sql.matchAll(
    /revoke\s+(?:all|execute)[^;]*?\bon\s+(?:all\s+functions\s+in\s+schema\s+public|function\s+public\.([a-z0-9_]+))[^;]*?\bfrom\s+([^;]+);/gi,
  )) {
    const fnName = m[1]?.toLowerCase();
    const fromList = m[2].toLowerCase();
    if (!/\b(public|anon)\b/.test(fromList)) continue;
    if (fnName) {
      if (definerFns.has(fnName)) definerFns.get(fnName).revoked = true;
    } else {
      // Bulk revoke covers everything currently known.
      for (const meta of definerFns.values()) meta.revoked = true;
    }
  }

  // CREATE [OR REPLACE] VIEW public.<v>
  for (const m of sql.matchAll(
    /create\s+(?:or\s+replace\s+)?view\s+public\.([a-z0-9_]+)([\s\S]*?)\bas\b/gi,
  )) {
    const v = m[1].toLowerCase();
    const head = m[2];
    const invoker = /security_invoker\s*=\s*(on|true)/i.test(head);
    views.set(v, { invoker, createdIn: file });
  }

  // ALTER VIEW public.<v> SET (security_invoker = on)
  for (const m of sql.matchAll(
    /alter\s+view\s+public\.([a-z0-9_]+)\s+set\s*\(([^)]*)\)/gi,
  )) {
    const v = m[1].toLowerCase();
    if (/security_invoker\s*=\s*(on|true)/i.test(m[2])) {
      if (!views.has(v)) views.set(v, { invoker: true, createdIn: file });
      else views.get(v).invoker = true;
    }
  }

  // DROP VIEW public.<v>
  for (const m of sql.matchAll(
    /drop\s+view\s+(?:if\s+exists\s+)?public\.([a-z0-9_]+)/gi,
  )) {
    views.delete(m[1].toLowerCase());
  }

  // Realtime publication membership.
  for (const m of sql.matchAll(
    /alter\s+publication\s+supabase_realtime\s+add\s+table\s+(?:only\s+)?public\.([a-z0-9_]+)/gi,
  )) {
    realtimeTables.add(m[1].toLowerCase());
  }
  for (const m of sql.matchAll(
    /alter\s+publication\s+supabase_realtime\s+drop\s+table\s+(?:only\s+)?public\.([a-z0-9_]+)/gi,
  )) {
    realtimeTables.delete(m[1].toLowerCase());
  }

  // chat-images public SELECT policy regression check.
  if (/create\s+policy\s+"?Anyone can view chat images"?/i.test(sql)) {
    chatImagesPublicPolicy = true;
  }
  if (/drop\s+policy\s+(?:if\s+exists\s+)?"?Anyone can view chat images"?/i.test(sql)) {
    chatImagesPublicPolicy = false;
  }
}

// 1. Tables.
for (const [name, meta] of tables) {
  if (!meta.grants) {
    warn(
      `public.${name}: missing GRANT statement (first defined in ${meta.createdIn}). See SECURITY_HARDENING.md §2.`,
    );
  }
  if (!meta.rls) {
    warn(
      `public.${name}: RLS never enabled (defined in ${meta.createdIn}). See SECURITY_HARDENING.md §2.`,
    );
  }
  if (!meta.policies) {
    warn(
      `public.${name}: no RLS policy created (defined in ${meta.createdIn}). See SECURITY_HARDENING.md §4.`,
    );
  }
}

// 2. SECURITY DEFINER functions.
for (const [fn, meta] of definerFns) {
  if (!meta.revoked) {
    warn(
      `public.${fn}(): SECURITY DEFINER function never REVOKEs EXECUTE from PUBLIC/anon (defined in ${meta.createdIn}). See SECURITY_HARDENING.md §2.`,
    );
  }
}

// 3. Views.
for (const [v, meta] of views) {
  if (!meta.invoker) {
    warn(
      `public.${v}: view is missing security_invoker = on (defined in ${meta.createdIn}). See SECURITY_HARDENING.md §3.`,
    );
  }
}

// 4. chat-images.
if (chatImagesPublicPolicy) {
  warn(
    `chat-images bucket has an unrevoked "Anyone can view chat images" policy. See SECURITY_HARDENING.md §5.`,
  );
}

// 5. Realtime publication.
for (const t of FORBIDDEN_REALTIME_TABLES) {
  if (realtimeTables.has(t)) {
    warn(
      `public.${t} is published to supabase_realtime but is on the deny list. See SECURITY_HARDENING.md §6.`,
    );
  }
}

if (errors.length) {
  console.error(
    `\n❌ Security hardening regression(s) detected (${errors.length}):\n`,
  );
  for (const e of errors) console.error(`  - ${e}`);
  console.error(
    "\nFix the migration(s) above or, if the change is intentional, update docs/SECURITY_HARDENING.md in the same PR.\n",
  );
  process.exit(1);
}

console.log(
  `✅ Security hardening invariants OK across ${migrationFiles.length} migration(s): ` +
    `${tables.size} public tables, ${definerFns.size} SECURITY DEFINER functions, ${views.size} views verified.`,
);