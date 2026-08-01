#!/usr/bin/env node
/**
 * Fails the build when package-lock.json is out of sync with package.json.
 *
 * Dependency-free on purpose: this can run as a `preinstall` hook, before
 * node_modules exists. It compares the declared dependency ranges in
 * package.json against the lockfile's root package entry, and verifies each
 * dependency actually has a resolved entry in the lockfile tree.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = path.join(root, "package.json");
const lockPath = path.join(root, "package-lock.json");

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;

function fail(lines) {
  console.error(red("\n✘ package-lock.json is out of sync with package.json\n"));
  for (const line of lines) console.error("  " + line);
  console.error(
    yellow(
      "\nFix it by regenerating the lockfile and committing the result:\n" +
        "    npm install --package-lock-only\n" +
        "    git add package-lock.json && git commit -m \"chore: sync lockfile\"\n" +
        "\n`npm ci` (used by Vercel and CI) refuses to install in this state.\n"
    )
  );
  process.exit(1);
}

if (!existsSync(lockPath)) {
  fail(["package-lock.json is missing entirely."]);
}

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const lock = JSON.parse(readFileSync(lockPath, "utf8"));

if (lock.lockfileVersion < 2) {
  fail([
    `lockfileVersion ${lock.lockfileVersion} is too old to verify (need >= 2).`,
  ]);
}

const rootEntry = lock.packages?.[""] ?? {};
const problems = [];

for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
  const declared = pkg[field] ?? {};
  const locked = rootEntry[field] ?? {};

  for (const [name, range] of Object.entries(declared)) {
    if (!(name in locked)) {
      problems.push(
        `MISSING   ${name}@${range} — declared in package.json (${field}) but absent from the lockfile`
      );
      continue;
    }
    if (locked[name] !== range) {
      problems.push(
        `MISMATCH  ${name} — package.json wants "${range}", lockfile records "${locked[name]}"`
      );
      continue;
    }
    const hasTree =
      lock.packages?.[`node_modules/${name}`] !== undefined ||
      Object.keys(lock.packages ?? {}).some((k) =>
        k.endsWith(`/node_modules/${name}`)
      );
    if (!hasTree) {
      problems.push(
        `UNRESOLVED ${name}@${range} — no installed entry in the lockfile tree`
      );
    }
  }

  for (const name of Object.keys(locked)) {
    if (!(name in declared)) {
      problems.push(
        `EXTRA     ${name} — present in the lockfile (${field}) but not in package.json`
      );
    }
  }
}

if (problems.length > 0) fail(problems);

console.log(green("✔ package-lock.json is in sync with package.json"));