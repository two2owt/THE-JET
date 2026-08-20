import { describe, expect, it } from "vitest";
import {
  adminClient,
  anonClient,
  integrationEnvReady,
} from "./supabase-test-clients";

const d = integrationEnvReady ? describe : describe.skip;

d("realtime broadcast guard", () => {
  it("reports no open critical alerts", async () => {
    const admin = adminClient();
    const { error } = await admin.rpc("check_realtime_guard" as never);
    expect(error).toBeNull();

    const { data } = await admin
      .from("realtime_guard_alerts" as never)
      .select("check_name, target, severity, status")
      .eq("status", "open");
    const critical = (data ?? []).filter(
      (a: { severity: string }) => a.severity === "critical",
    );
    expect(critical).toEqual([]);
  });

  it("keeps every published table approved, RLS-enabled and owner-scoped", async () => {
    const admin = adminClient();
    const { data, error } = await admin.rpc(
      "realtime_publication_audit" as never,
    );
    expect(error).toBeNull();
    const rows = (data ?? []) as unknown as Array<{
      table_name: string;
      approved: boolean;
      rls_enabled: boolean;
      sensitivity: string;
      unscoped_select_policies: string[];
    }>;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.approved, `${row.table_name} not allowlisted`).toBe(true);
      expect(row.rls_enabled, `${row.table_name} RLS off`).toBe(true);
      if (row.sensitivity === "private") {
        expect(
          row.unscoped_select_policies,
          `${row.table_name} has unscoped SELECT policies`,
        ).toEqual([]);
      }
    }
  });

  it("hides guard alerts and audit RPCs from anonymous callers", async () => {
    const anon = anonClient();
    const audit = await anon.rpc("realtime_publication_audit" as never);
    expect(audit.error).not.toBeNull();

    const check = await anon.rpc("check_realtime_guard" as never);
    expect(check.error).not.toBeNull();

    const alerts = await anon
      .from("realtime_guard_alerts" as never)
      .select("id");
    expect(alerts.data ?? []).toEqual([]);
  });
});
