import { describe, expect, it } from "vitest";
import { createInflightReads } from "@/lib/inflightReads";

describe("simultaneous notification reads", () => {
  it("runs identical overlapping reads once", async () => {
    const read = createInflightReads();
    let calls = 0;
    const load = async () => { calls++; return ["alert"]; };
    const results = await Promise.all([read("user-a:logs", load), read("user-a:logs", load)]);
    expect(calls).toBe(1);
    expect(results).toEqual([["alert"], ["alert"]]);
  });

  it("never shares results across accounts", async () => {
    const read = createInflightReads();
    const results = await Promise.all([
      read("user-a:logs", async () => ["a"]),
      read("user-b:logs", async () => ["b"]),
    ]);
    expect(results).toEqual([["a"], ["b"]]);
  });

  it("fetches fresh data after a read completes", async () => {
    const read = createInflightReads();
    expect(await read("user:logs", async () => ["unread"])).toEqual(["unread"]);
    expect(await read("user:logs", async () => ["read"])).toEqual(["read"]);
  });

  it("allows retry after failure", async () => {
    const read = createInflightReads();
    await expect(read("user:logs", async () => { throw new Error("offline"); })).rejects.toThrow("offline");
    expect(await read("user:logs", async () => ["recovered"])).toEqual(["recovered"]);
  });
});