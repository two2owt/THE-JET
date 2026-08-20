import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  anonClient,
  createTestUser,
  deleteTestUser,
  integrationEnvReady,
  type TestUser,
} from "./supabase-test-clients";

/**
 * Guards the visibility decisions recorded in security memory:
 *
 *  - `neighborhoods` is public read-only reference data (active rows only).
 *  - `user_favorites` / `search_history` are owner-only, including over Realtime.
 *  - `user_connections` is visible to exactly the two parties, at any status,
 *    and to nobody else — over both the Data API and Realtime.
 *
 * Realtime is exercised end-to-end: each subscriber only ever receives
 * postgres_changes payloads that its own SELECT policy would allow.
 */
const d = integrationEnvReady ? describe : describe.skip;

const REALTIME_WAIT_MS = 12_000;
const QUIET_WAIT_MS = 6_000;

type Captured = { table: string; row: Record<string, unknown> };

/** Subscribes to postgres_changes on `tables` and collects every row delivered. */
async function listen(
  client: SupabaseClient,
  name: string,
  tables: string[],
): Promise<{ received: Captured[]; channel: RealtimeChannel; stop: () => Promise<void> }> {
  const received: Captured[] = [];
  let channel = client.channel(`${name}-${Math.random().toString(36).slice(2)}`);

  for (const table of tables) {
    channel = channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      (payload) => {
        const row = (payload.new ?? payload.old ?? {}) as Record<string, unknown>;
        received.push({ table, row });
      },
    );
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`realtime subscribe timed out for ${name}`)),
      REALTIME_WAIT_MS,
    );
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timer);
        resolve();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timer);
        reject(new Error(`realtime subscribe failed for ${name}: ${status}`));
      }
    });
  });

  return {
    received,
    channel,
    stop: async () => {
      await client.removeChannel(channel).catch(() => {});
    },
  };
}

/** Resolves once `predicate` holds, or after `timeoutMs`. */
async function settle(predicate: () => boolean, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return predicate();
}

d("Realtime + public-read locks", () => {
  let alice: TestUser;
  let bob: TestUser;
  let carol: TestUser;

  beforeAll(async () => {
    [alice, bob, carol] = await Promise.all([
      createTestUser("rt-alice"),
      createTestUser("rt-bob"),
      createTestUser("rt-carol"),
    ]);
  });

  afterAll(async () => {
    const admin = adminClient();
    await admin
      .from("user_connections")
      .delete()
      .in("user_id", [alice.id, bob.id, carol.id]);
    await admin
      .from("user_favorites")
      .delete()
      .in("user_id", [alice.id, bob.id, carol.id]);
    await admin
      .from("search_history")
      .delete()
      .in("user_id", [alice.id, bob.id, carol.id]);
    await Promise.all([
      deleteTestUser(alice),
      deleteTestUser(bob),
      deleteTestUser(carol),
    ]);
  });

  describe("neighborhoods: public reference data, read-only", () => {
    it("serves only active rows to anonymous visitors", async () => {
      const { data, error } = await anonClient()
        .from("neighborhoods")
        .select("id, name, slug, active")
        .limit(200);

      expect(error).toBeNull();
      for (const row of data ?? []) {
        expect(row.active).toBe(true);
      }
    });

    it("never exposes inactive rows, even when asked for them directly", async () => {
      const admin = adminClient();
      const inactive = await admin
        .from("neighborhoods")
        .select("id")
        .eq("active", false)
        .limit(1);

      if (!inactive.data?.length) return; // nothing inactive to probe

      const probe = await anonClient()
        .from("neighborhoods")
        .select("id")
        .eq("id", inactive.data[0].id);
      expect(probe.error).toBeNull();
      expect(probe.data).toEqual([]);
    });

    it("rejects writes from anonymous and signed-in users", async () => {
      const row = {
        name: "RLS Probe Neighborhood",
        slug: `rls-probe-${Date.now()}`,
        boundary_points: [],
        center_lat: 35.2271,
        center_lng: -80.8431,
      };

      const anonInsert = await anonClient().from("neighborhoods").insert(row);
      expect(anonInsert.error).not.toBeNull();

      const userInsert = await alice.client.from("neighborhoods").insert(row);
      expect(userInsert.error?.code).toBe("42501");

      const userUpdate = await alice.client
        .from("neighborhoods")
        .update({ name: "hijacked" })
        .eq("active", true)
        .select("id");
      expect(userUpdate.data ?? []).toEqual([]);

      const userDelete = await alice.client
        .from("neighborhoods")
        .delete()
        .eq("active", true)
        .select("id");
      expect(userDelete.data ?? []).toEqual([]);
    });
  });

  describe("user_favorites + search_history over Realtime", () => {
    it("delivers a favorite back to its own owner", async () => {
      const aliceListener = await listen(alice.client, "alice-own", [
        "user_favorites",
      ]);

      try {
        const marker = `rt-own-${Date.now()}`;
        const fav = await alice.client
          .from("user_favorites")
          .insert({
            user_id: alice.id,
            venue_id: marker,
            venue_name: "Own Realtime Venue",
          })
          .select("id")
          .single();
        expect(fav.error).toBeNull();

        const delivered = await settle(
          () =>
            aliceListener.received.some(
              (c) => c.table === "user_favorites" && c.row.venue_id === marker,
            ),
          REALTIME_WAIT_MS,
        );
        expect(delivered).toBe(true);

        for (const capture of aliceListener.received) {
          expect(capture.row.user_id).toBe(alice.id);
        }
      } finally {
        await aliceListener.stop();
      }
    }, 60_000);
    it("delivers a user's own rows to them and nobody else's", async () => {
      const bobListener = await listen(bob.client, "bob-private", [
        "user_favorites",
        "search_history",
      ]);
      try {
        const marker = `rt-${Date.now()}`;

        const fav = await alice.client.from("user_favorites").insert({
          user_id: alice.id,
          venue_id: `${marker}-venue`,
          venue_name: "Realtime Probe Venue",
        });
        expect(fav.error).toBeNull();

        const hist = await alice.client.from("search_history").insert({
          user_id: alice.id,
          search_query: `${marker}-query`,
        });
        expect(hist.error).toBeNull();

        // Alice must still see her own rows through the Data API.
        const ownFav = await alice.client
          .from("user_favorites")
          .select("id")
          .eq("venue_id", `${marker}-venue`);
        expect(ownFav.data?.length).toBe(1);

        // Give Realtime a generous window to (incorrectly) deliver anything.
        await settle(() => bobListener.received.length > 0, QUIET_WAIT_MS);

        expect(bobListener.received).toEqual([]);

        // And the Data API agrees.
        const bobFav = await bob.client
          .from("user_favorites")
          .select("id")
          .eq("venue_id", `${marker}-venue`);
        expect(bobFav.data ?? []).toEqual([]);

        const bobHist = await bob.client
          .from("search_history")
          .select("id")
          .eq("search_query", `${marker}-query`);
        expect(bobHist.data ?? []).toEqual([]);
      } finally {
        await bobListener.stop();
      }
    }, 60_000);

  });

  describe("user_connections: two parties only, at any status", () => {
    it("shows a pending request to both parties and hides it from everyone else", async () => {
      const carolListener = await listen(carol.client, "carol-conn", [
        "user_connections",
      ]);
      try {
        const created = await alice.client
          .from("user_connections")
          .insert({ user_id: alice.id, friend_id: bob.id, status: "pending" })
          .select("id")
          .single();
        expect(created.error).toBeNull();
        const id = created.data!.id;

        // Requester sees it.
        const asAlice = await alice.client
          .from("user_connections")
          .select("id, status")
          .eq("id", id);
        expect(asAlice.data?.length).toBe(1);
        expect(asAlice.data?.[0].status).toBe("pending");

        // Recipient sees it too — required to accept or decline.
        const asBob = await bob.client
          .from("user_connections")
          .select("id, status")
          .eq("id", id);
        expect(asBob.data?.length).toBe(1);

        // Bystanders never do.
        const asCarol = await carol.client
          .from("user_connections")
          .select("id")
          .eq("id", id);
        expect(asCarol.error).toBeNull();
        expect(asCarol.data).toEqual([]);

        const asAnon = await anonClient()
          .from("user_connections")
          .select("id")
          .eq("id", id);
        expect(asAnon.data ?? []).toEqual([]);

        await settle(() => carolListener.received.length > 0, QUIET_WAIT_MS);
        expect(carolListener.received).toEqual([]);
      } finally {
        await carolListener.stop();
      }
    }, 60_000);

    it("lets only the recipient change status and blocks spoofed requesters", async () => {
      const created = await alice.client
        .from("user_connections")
        .insert({ user_id: alice.id, friend_id: carol.id, status: "pending" })
        .select("id")
        .single();
      expect(created.error).toBeNull();
      const id = created.data!.id;

      // Requester cannot self-accept.
      const selfAccept = await alice.client
        .from("user_connections")
        .update({ status: "accepted" })
        .eq("id", id)
        .select("id");
      expect(selfAccept.data ?? []).toEqual([]);

      // Bystander cannot accept.
      const bystander = await bob.client
        .from("user_connections")
        .update({ status: "accepted" })
        .eq("id", id)
        .select("id");
      expect(bystander.data ?? []).toEqual([]);

      // Recipient can.
      const accept = await carol.client
        .from("user_connections")
        .update({ status: "accepted" })
        .eq("id", id)
        .select("id, status")
        .single();
      expect(accept.error).toBeNull();
      expect(accept.data?.status).toBe("accepted");

      // Nobody can forge a request from another account.
      const spoof = await bob.client.from("user_connections").insert({
        user_id: alice.id,
        friend_id: carol.id,
        status: "pending",
      });
      expect(spoof.error?.code).toBe("42501");
    });
  });
});
