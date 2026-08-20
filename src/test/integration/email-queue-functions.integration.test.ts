import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, integrationEnvReady } from "./supabase-test-clients";

/**
 * Function-level coverage for the pgmq email-queue wrappers.
 *
 * Asserts both:
 *  - the pinned `search_path = pgmq, public` on every wrapper (schema-shadowing
 *    hardening; linter finding SUPA_function_search_path_mutable), and
 *  - the runtime contract of enqueue -> read -> move_to_dlq -> delete.
 *
 * Uses a throwaway probe queue so no real email is ever enqueued or sent.
 */
const FUNCTIONS = ["enqueue_email", "read_email_batch", "move_to_dlq", "delete_email"] as const;
const EXPECTED_SEARCH_PATH = "search_path=pgmq, public";

const d = integrationEnvReady ? describe : describe.skip;
const psqlReady = Boolean(process.env.PGHOST);

function psql(sql: string): string {
  return execFileSync("psql", ["-At", "-c", sql], { encoding: "utf8" }).trim();
}

d("email queue functions", () => {
  // Vitest still evaluates the body of a skipped describe, so the client must
  // be created lazily — otherwise a missing service key throws at collection
  // time and fails the whole suite instead of skipping it.
  let _admin: SupabaseClient | undefined;
  const admin = (): SupabaseClient => (_admin ??= adminClient());
  const queue = `probe_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const dlq = `${queue}_dlq`;

  afterAll(async () => {
    // Drain anything the test left behind so no probe message can be picked up.
    for (const q of [queue, dlq]) {
      const { data } = await admin.rpc("read_email_batch", { queue_name: q, batch_size: 50, vt: 1 });
      for (const msg of data ?? []) {
        await admin.rpc("delete_email", { queue_name: q, message_id: msg.msg_id });
      }
    }
  });

  (psqlReady ? describe : describe.skip)("search_path pinning", () => {
    it.each(FUNCTIONS)("%s pins search_path to pgmq, public", (fn) => {
      const config = psql(
        `select coalesce(array_to_string(p.proconfig, ','), '') from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = '${fn}'`
      );
      expect(config).toBe(EXPECTED_SEARCH_PATH);
    });

    it("leaves no public function with a mutable search_path", () => {
      const unpinned = psql(
        `select coalesce(string_agg(p.proname, ','), '') from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and not exists (
             select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'
           )`
      );
      expect(unpinned).toBe("");
    });
  });

  it("round-trips enqueue -> read -> move_to_dlq -> delete", async () => {
    const payload = { probe: true, message_id: `probe-${randomUUID()}` };

    const enqueued = await admin.rpc("enqueue_email", { queue_name: queue, payload });
    expect(enqueued.error).toBeNull();
    expect(typeof enqueued.data).toBe("number");

    const read = await admin.rpc("read_email_batch", { queue_name: queue, batch_size: 5, vt: 10 });
    expect(read.error).toBeNull();
    const message = (read.data ?? []).find((m: any) => m.msg_id === enqueued.data);
    expect(message).toBeDefined();
    expect(message.message.message_id).toBe(payload.message_id);

    const moved = await admin.rpc("move_to_dlq", {
      source_queue: queue,
      dlq_name: dlq,
      message_id: enqueued.data,
      payload,
    });
    expect(moved.error).toBeNull();
    expect(typeof moved.data).toBe("number");

    // Source queue no longer holds the message.
    const afterMove = await admin.rpc("read_email_batch", { queue_name: queue, batch_size: 5, vt: 1 });
    expect((afterMove.data ?? []).some((m: any) => m.msg_id === enqueued.data)).toBe(false);

    const deleted = await admin.rpc("delete_email", { queue_name: dlq, message_id: moved.data });
    expect(deleted.error).toBeNull();
    expect(deleted.data).toBe(true);

    const afterDelete = await admin.rpc("read_email_batch", { queue_name: dlq, batch_size: 5, vt: 1 });
    expect((afterDelete.data ?? []).some((m: any) => m.msg_id === moved.data)).toBe(false);
  });

  it("auto-creates a missing queue instead of erroring", async () => {
    const fresh = `probe_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const read = await admin.rpc("read_email_batch", { queue_name: fresh, batch_size: 5, vt: 1 });
    expect(read.error).toBeNull();
    expect(read.data ?? []).toHaveLength(0);

    const enqueued = await admin.rpc("enqueue_email", { queue_name: fresh, payload: { probe: true } });
    expect(enqueued.error).toBeNull();
    const deleted = await admin.rpc("delete_email", { queue_name: fresh, message_id: enqueued.data });
    expect(deleted.data).toBe(true);
  });

  it("delete_email returns false for an unknown queue", async () => {
    const missing = await admin.rpc("delete_email", {
      queue_name: `probe_absent_${randomUUID().replace(/-/g, "").slice(0, 8)}`,
      message_id: 1,
    });
    expect(missing.error).toBeNull();
    expect(missing.data).toBe(false);
  });
});
