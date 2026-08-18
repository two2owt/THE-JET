import { describe, expect, it, beforeAll, afterAll } from "vitest";
import {
  adminClient,
  anonClient,
  createTestUser,
  deleteTestUser,
  integrationEnvReady,
  type TestUser,
} from "./supabase-test-clients";

/**
 * RLS integration coverage against the live backend.
 *
 * Table mapping (the app has no literal `venues` / `layers` tables):
 *  - venues  -> public `deals` catalog + per-user `user_favorites` (saved venues)
 *  - layers  -> `user_preferences` (per-user map/tracking layer state)
 *  - user_locations -> raw location pings
 */
const d = integrationEnvReady ? describe : describe.skip;

d("RLS: venues, layers, user_locations", () => {
  let alice: TestUser;
  let bob: TestUser;
  const createdLocationIds: string[] = [];

  beforeAll(async () => {
    [alice, bob] = await Promise.all([
      createTestUser("alice"),
      createTestUser("bob"),
    ]);
  });

  afterAll(async () => {
    const admin = adminClient();
    if (createdLocationIds.length) {
      await admin.from("user_locations").delete().in("id", createdLocationIds);
    }
    await Promise.all([deleteTestUser(alice), deleteTestUser(bob)]);
  });

  describe("venues: deals (public catalog)", () => {
    it("lets anonymous visitors read only active, in-window deals", async () => {
      const { data, error } = await anonClient()
        .from("deals")
        .select("id, active, starts_at, expires_at")
        .limit(50);

      expect(error).toBeNull();
      const now = Date.now();
      for (const row of data ?? []) {
        expect(row.active).toBe(true);
        expect(new Date(row.starts_at).getTime()).toBeLessThanOrEqual(now);
        expect(new Date(row.expires_at).getTime()).toBeGreaterThan(now);
      }
    });

    it("blocks non-admin writes to deals", async () => {
      const { error } = await alice.client.from("deals").insert({
        venue_id: "rls-test-venue",
        venue_name: "RLS Test Venue",
        title: "Should not insert",
        description: "Should not insert",
        deal_type: "food",
        starts_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      });
      expect(error).not.toBeNull();
      expect(error?.code).toBe("42501");
    });
  });

  describe("venues: user_favorites (saved venues)", () => {
    it("scopes reads to the owner and rejects spoofed owners", async () => {
      const insert = await alice.client
        .from("user_favorites")
        .insert({
          user_id: alice.id,
          venue_id: "rls-fav-venue",
          venue_name: "Favorite Venue",
        })
        .select("id")
        .single();
      expect(insert.error).toBeNull();

      const own = await alice.client
        .from("user_favorites")
        .select("id, user_id")
        .eq("venue_id", "rls-fav-venue");
      expect(own.error).toBeNull();
      expect(own.data?.length).toBe(1);

      const other = await bob.client
        .from("user_favorites")
        .select("id")
        .eq("venue_id", "rls-fav-venue");
      expect(other.error).toBeNull();
      expect(other.data).toEqual([]);

      const spoof = await bob.client.from("user_favorites").insert({
        user_id: alice.id,
        venue_id: "rls-fav-spoof",
        venue_name: "Spoofed",
      });
      expect(spoof.error?.code).toBe("42501");

      const anon = await anonClient()
        .from("user_favorites")
        .select("id")
        .limit(1);
      expect(anon.data ?? []).toEqual([]);

      await alice.client
        .from("user_favorites")
        .delete()
        .eq("id", insert.data!.id);
    });
  });

  describe("layers: user_preferences", () => {
    it("keeps layer/tracking preferences private to their owner", async () => {
      const upsert = await alice.client
        .from("user_preferences")
        .upsert(
          { user_id: alice.id, location_tracking_enabled: true },
          { onConflict: "user_id" },
        )
        .select("id, user_id")
        .single();
      expect(upsert.error).toBeNull();
      expect(upsert.data?.user_id).toBe(alice.id);

      const bobRead = await bob.client
        .from("user_preferences")
        .select("id")
        .eq("user_id", alice.id);
      expect(bobRead.error).toBeNull();
      expect(bobRead.data).toEqual([]);

      const bobWrite = await bob.client
        .from("user_preferences")
        .update({ location_tracking_enabled: false })
        .eq("user_id", alice.id)
        .select("id");
      expect(bobWrite.data ?? []).toEqual([]);

      const spoof = await bob.client
        .from("user_preferences")
        .insert({ user_id: alice.id });
      expect(spoof.error?.code).toBe("42501");

      const anon = await anonClient()
        .from("user_preferences")
        .select("id")
        .limit(1);
      expect(anon.data ?? []).toEqual([]);
    });
  });

  describe("user_locations", () => {
    it("allows owner inserts/reads and hides pings from other users", async () => {
      const mine = await alice.client
        .from("user_locations")
        .insert({ user_id: alice.id, latitude: 35.2271, longitude: -80.8431 })
        .select("id")
        .single();
      expect(mine.error).toBeNull();
      createdLocationIds.push(mine.data!.id);

      const ownRead = await alice.client
        .from("user_locations")
        .select("id, user_id")
        .eq("id", mine.data!.id);
      expect(ownRead.data?.length).toBe(1);
      expect(ownRead.data?.[0].user_id).toBe(alice.id);

      const bobRead = await bob.client
        .from("user_locations")
        .select("id")
        .eq("id", mine.data!.id);
      expect(bobRead.error).toBeNull();
      expect(bobRead.data).toEqual([]);

      const spoof = await bob.client
        .from("user_locations")
        .insert({ user_id: alice.id, latitude: 1, longitude: 1 });
      expect(spoof.error?.code).toBe("42501");

      const bobUpdate = await bob.client
        .from("user_locations")
        .update({ latitude: 0 })
        .eq("id", mine.data!.id)
        .select("id");
      expect(bobUpdate.data ?? []).toEqual([]);

      const bobDelete = await bob.client
        .from("user_locations")
        .delete()
        .eq("id", mine.data!.id)
        .select("id");
      expect(bobDelete.data ?? []).toEqual([]);

      const anon = await anonClient()
        .from("user_locations")
        .select("id")
        .limit(1);
      expect(anon.data ?? []).toEqual([]);
    });
  });
});
