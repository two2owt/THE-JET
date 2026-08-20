import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Realtime broadcast/presence payloads are NOT filtered by table RLS, so they
 * must never carry rows from owner-scoped tables. Only the ephemeral typing
 * indicator is allowed to broadcast, and it may only send a user id.
 */
const SRC = join(process.cwd(), "src");

const SENSITIVE_TABLES = [
  "user_favorites",
  "search_history",
  "user_connections",
  "user_locations",
  "profiles",
  "messages",
  "chat_images",
];

const ALLOWED_BROADCAST_EVENTS = ["typing"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === "node_modules" ? [] : walk(full);
    }
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

const sourceFiles = walk(SRC).filter((f) => !/[\\/]test[\\/]/.test(f));

describe("realtime broadcast guard", () => {
  it("only broadcasts allow-listed ephemeral events", () => {
    const offenders: string[] = [];
    // Matches `.on("broadcast", { event: "x" }` and `.send({ type: "broadcast", event: "x" ...`
    const onBroadcast = /\.on\(\s*["'`]broadcast["'`]\s*,\s*\{[^}]*event:\s*["'`]([^"'`]+)["'`]/g;
    const sendBroadcast =
      /\.send\(\s*\{[\s\S]{0,400}?type:\s*["'`]broadcast["'`][\s\S]{0,400}?event:\s*["'`]([^"'`]+)["'`]/g;

    for (const file of sourceFiles) {
      const source = readFileSync(file, "utf8");
      for (const pattern of [onBroadcast, sendBroadcast]) {
        pattern.lastIndex = 0;
        for (const match of source.matchAll(pattern)) {
          if (!ALLOWED_BROADCAST_EVENTS.includes(match[1])) {
            offenders.push(`${file}: broadcast event "${match[1]}"`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("never puts sensitive table rows in a broadcast payload", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles) {
      const source = readFileSync(file, "utf8");
      const sends = [
        ...source.matchAll(/\.send\(\s*\{[\s\S]{0,400}?\}\s*\)/g),
      ].map((m) => m[0]);

      for (const send of sends) {
        if (!/type:\s*["'`]broadcast["'`]/.test(send)) continue;
        for (const table of SENSITIVE_TABLES) {
          if (send.includes(table)) {
            offenders.push(`${file}: broadcast payload references "${table}"`);
          }
        }
        // Payloads must stay tiny; anything with row-ish spreads is suspect.
        if (/payload:\s*\{[^}]*\.\.\./.test(send)) {
          offenders.push(`${file}: broadcast payload spreads an object`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("uses presence only without table payloads", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles) {
      const source = readFileSync(file, "utf8");
      if (!/\.track\(/.test(source) && !/["'`]presence["'`]/.test(source)) {
        continue;
      }
      for (const table of SENSITIVE_TABLES) {
        const trackCalls = [...source.matchAll(/\.track\(\s*\{[\s\S]{0,300}?\}\s*\)/g)];
        if (trackCalls.some((m) => m[0].includes(table))) {
          offenders.push(`${file}: presence track references "${table}"`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
