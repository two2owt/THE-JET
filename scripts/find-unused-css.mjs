#!/usr/bin/env node
/**
 * Unused CSS selector & @keyframes auditor.
 *
 * Scans `src/index.css` for:
 *   - custom class selectors (e.g. `.shimmer-skeleton`)
 *   - `@keyframes <name>`
 *
 * Then full-text searches `src/`, `index.html`, and `public/` for each
 * identifier (raw substring match — catches dynamic `cn()` / template-string
 * usages that AST tools miss).
 *
 * Tailwind utilities (those defined inside `@layer utilities { ... }` and
 * standard tailwind class names) are skipped — only project-defined custom
 * classes that look candidate-for-removal are reported.
 *
 * Exit codes:
 *   0  → no unused selectors found (or `--report` mode, never fails)
 *   1  → unused selectors found and `--strict` flag passed
 *
 * Usage:
 *   node scripts/find-unused-css.mjs            # report only
 *   node scripts/find-unused-css.mjs --strict   # fail CI on findings
 *   node scripts/find-unused-css.mjs --json     # machine-readable output
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = process.cwd();
const CSS_FILE = join(ROOT, "src/index.css");
const SEARCH_ROOTS = ["src", "index.html", "public"].filter((p) =>
  existsSync(join(ROOT, p))
);
const SEARCH_EXTS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".html", ".css", ".mdx", ".md",
]);

const args = new Set(process.argv.slice(2));
const STRICT = args.has("--strict");
const JSON_OUT = args.has("--json");

// ---------------------------------------------------------------------------
// 1. Collect custom class selectors and @keyframes from index.css
// ---------------------------------------------------------------------------
const css = readFileSync(CSS_FILE, "utf8");

// Strip comments so we don't pick up commented-out selectors.
const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, "");

// Custom class selectors: `.foo-bar` (alphanumeric + dashes, must start with letter)
// Skip pseudo-classes (`:hover`), attribute selectors, etc.
const CLASS_RE = /\.([a-zA-Z][a-zA-Z0-9_-]*)/g;

// Common Tailwind / shadcn patterns to ignore — they're dynamically composed
// or generated, so a static grep is unreliable.
const TAILWIND_PREFIXES = [
  "bg-", "text-", "border-", "ring-", "shadow-", "from-", "to-", "via-",
  "hover:", "focus:", "active:", "dark:", "sm:", "md:", "lg:", "xl:", "2xl:",
  "data-", "group", "peer", "rtl-", "ltr-", "before:", "after:",
];
const TAILWIND_EXACT = new Set([
  "container", "sr-only", "not-sr-only", "antialiased", "subpixel-antialiased",
]);

function isLikelyTailwind(cls) {
  if (TAILWIND_EXACT.has(cls)) return true;
  // Single utility-style tokens like `flex`, `grid`, `block`, `hidden` — keep
  // these out of the report; only flag custom multi-token names with a dash
  // OR our known custom prefixes.
  if (!cls.includes("-") && cls.length < 6) return true;
  for (const p of TAILWIND_PREFIXES) {
    if (cls.startsWith(p)) return true;
  }
  return false;
}

const allClasses = new Set();
let m;
while ((m = CLASS_RE.exec(cssNoComments)) !== null) {
  const name = m[1];
  if (!isLikelyTailwind(name)) allClasses.add(name);
}

// @keyframes
const KEYFRAMES_RE = /@keyframes\s+([a-zA-Z][a-zA-Z0-9_-]*)/g;
const allKeyframes = new Set();
while ((m = KEYFRAMES_RE.exec(cssNoComments)) !== null) {
  allKeyframes.add(m[1]);
}

// ---------------------------------------------------------------------------
// 2. Build a single concatenated search corpus from src/ + index.html
// ---------------------------------------------------------------------------
function* walk(dir) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      yield* walk(full);
    } else if (st.isFile()) {
      yield full;
    }
  }
}

let corpus = "";
for (const root of SEARCH_ROOTS) {
  const full = join(ROOT, root);
  const st = statSync(full);
  if (st.isFile()) {
    corpus += "\n" + readFileSync(full, "utf8");
    continue;
  }
  for (const file of walk(full)) {
    if (file === CSS_FILE) continue; // don't count the definition site
    if (!SEARCH_EXTS.has(extname(file))) continue;
    corpus += "\n" + readFileSync(file, "utf8");
  }
}

// Also scan tailwind.config.ts (safelist, plugin output) so we don't flag
// classes referenced from there.
const TAILWIND_CFG = join(ROOT, "tailwind.config.ts");
if (existsSync(TAILWIND_CFG)) {
  corpus += "\n" + readFileSync(TAILWIND_CFG, "utf8");
}

// ---------------------------------------------------------------------------
// 3. Diff: which selectors / keyframes never appear in the corpus?
// ---------------------------------------------------------------------------
const unusedClasses = [];
for (const cls of allClasses) {
  // Match as a whole word — class names can appear in:
  //   className="foo bar"   ->  surrounded by quotes/spaces
  //   `cn("foo", cond && "bar")`
  //   plain HTML class="..."
  // A simple substring match would over-report (`pulse` matches `animate-pulse`),
  // so we require a non-class-name boundary on either side.
  const re = new RegExp(`(^|[^a-zA-Z0-9_-])${escapeRegex(cls)}([^a-zA-Z0-9_-]|$)`);
  if (!re.test(corpus)) unusedClasses.push(cls);
}

const unusedKeyframes = [];
for (const kf of allKeyframes) {
  // Keyframes are referenced by `animation: <name> ...` or `animation-name: <name>`
  // OR via tailwind config (`animation: { foo: 'name 1s ...' }`).
  // Always self-references in `@keyframes <name>` count as definitions only —
  // we already exclude the css file.
  const re = new RegExp(`(^|[^a-zA-Z0-9_-])${escapeRegex(kf)}([^a-zA-Z0-9_-]|$)`);
  if (!re.test(corpus)) unusedKeyframes.push(kf);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// 4. Report
// ---------------------------------------------------------------------------
const report = {
  scanned: {
    cssFile: "src/index.css",
    customClasses: allClasses.size,
    keyframes: allKeyframes.size,
    searchRoots: SEARCH_ROOTS,
  },
  unusedClasses: unusedClasses.sort(),
  unusedKeyframes: unusedKeyframes.sort(),
};

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const total = unusedClasses.length + unusedKeyframes.length;
  console.log("─────────────────────────────────────────────");
  console.log(" Unused CSS audit — src/index.css");
  console.log("─────────────────────────────────────────────");
  console.log(` Custom classes scanned : ${allClasses.size}`);
  console.log(` @keyframes scanned     : ${allKeyframes.size}`);
  console.log(` Search roots           : ${SEARCH_ROOTS.join(", ")}`);
  console.log("");
  if (unusedClasses.length) {
    console.log(`⚠  ${unusedClasses.length} unused class selector(s):`);
    for (const c of unusedClasses) console.log(`     .${c}`);
    console.log("");
  }
  if (unusedKeyframes.length) {
    console.log(`⚠  ${unusedKeyframes.length} unused @keyframes:`);
    for (const k of unusedKeyframes) console.log(`     @keyframes ${k}`);
    console.log("");
  }
  if (total === 0) {
    console.log("✓ No unused custom selectors or keyframes detected.");
  } else {
    console.log(`Total candidates for removal: ${total}`);
    console.log("");
    console.log("Note: this is a static report. Verify each entry is not");
    console.log("referenced via a dynamic class string before removing.");
  }
}

if (STRICT && (unusedClasses.length || unusedKeyframes.length)) {
  process.exit(1);
}