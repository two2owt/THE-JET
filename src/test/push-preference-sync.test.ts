import { beforeEach, describe, expect, it, vi } from "vitest";

type UpdateCall = { table: string; payload: Record<string, unknown>; filters: Array<[string, string, unknown]> };

const state = {
  user: { id: "user-1" } as { id: string } | null,
  consent: [{ granted: true }] as Array<{ granted: boolean }>,
  pref: { notifications_enabled: true } as { notifications_enabled: boolean | null } | null,
  updates: [] as UpdateCall[],
  rpc: vi.fn(async () => ({ error: null })),
  audit: [] as Array<Record<string, unknown>>,
};

function selectBuilder(rows: unknown) {
  const chain: Record<string, unknown> = {};
  const passthrough = () => chain;
  for (const m of ["select", "eq", "neq", "order", "limit"]) chain[m] = passthrough;
  chain["maybeSingle"] = async () => ({ data: rows, error: null });
  chain["then"] = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
  return chain;
}

function updateBuilder(table: string, payload: Record<string, unknown>) {
  const call: UpdateCall = { table, payload, filters: [] };
  state.updates.push(call);
  const chain: Record<string, unknown> = {};
  for (const m of ["eq", "neq"]) {
    chain[m] = (col: string, val: unknown) => {
      call.filters.push([m, col, val]);
      return chain;
    };
  }
  chain["then"] = (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null });
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: state.user } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    rpc: (...args: unknown[]) => state.rpc(...(args as [])),
    functions: { invoke: async () => ({ data: { publicKey: "test-key" }, error: null }) },
    from: (table: string) => ({
      select: () =>
        selectBuilder(table === "user_consents" ? state.consent : state.pref),
      update: (payload: Record<string, unknown>) => updateBuilder(table, payload),
      insert: async (payload: Record<string, unknown>) => {
        state.audit.push({ table, ...payload });
        return { error: null };
      },
    }),
  },
}));

const subscription = {
  endpoint: "https://push.example/endpoint-A",
  toJSON: () => ({
    endpoint: "https://push.example/endpoint-A",
    keys: { p256dh: "p", auth: "a" },
  }),
  unsubscribe: vi.fn(async () => true),
};

const pushManager = {
  getSubscription: vi.fn(async () => subscription as unknown),
  subscribe: vi.fn(async () => subscription as unknown),
};

function installBrowserPush(permission: NotificationPermission) {
  Object.defineProperty(window, "Notification", {
    configurable: true,
    value: { permission },
  });
  Object.defineProperty(window, "PushManager", { configurable: true, value: class {} });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      getRegistration: async () => ({ pushManager }),
      register: async () => ({ pushManager }),
      ready: Promise.resolve({ pushManager }),
    },
  });
}

async function loadModule() {
  vi.resetModules();
  return await import("@/hooks/usePushSubscriptionSync");
}

describe("push preference reconciliation (sign-in re-check flow)", () => {
  beforeEach(() => {
    state.user = { id: "user-1" };
    state.consent = [{ granted: true }];
    state.pref = { notifications_enabled: true };
    state.updates = [];
    state.audit = [];
    state.rpc.mockClear();
    localStorage.clear();
    pushManager.getSubscription.mockClear();
    pushManager.subscribe.mockClear();
    subscription.unsubscribe.mockClear();
    installBrowserPush("granted");
  });

  it("registers the device when the saved preference is on", async () => {
    const { applyPushPreference } = await loadModule();
    await applyPushPreference();

    expect(state.rpc).toHaveBeenCalledWith(
      "claim_push_subscription",
      expect.objectContaining({
        _endpoint: "https://push.example/endpoint-A",
        _platform: "web",
      }),
    );
    expect(state.audit).toContainEqual(
      expect.objectContaining({
        table: "push_notification_audit",
        action: "device_enabled",
      }),
    );
  });

  it("does not subscribe and deactivates the device when consent is revoked", async () => {
    state.consent = [{ granted: false }];
    const { applyPushPreference } = await loadModule();
    await applyPushPreference();

    expect(state.rpc).not.toHaveBeenCalled();
    expect(subscription.unsubscribe).toHaveBeenCalled();
    expect(state.audit).toContainEqual(
      expect.objectContaining({ action: "device_disabled" }),
    );
    expect(state.updates.some((u) => u.table === "push_notifications" && u.payload.active === false)).toBe(true);
  });

  it("does not subscribe when the master preference switch is off", async () => {
    state.pref = { notifications_enabled: false };
    const { applyPushPreference } = await loadModule();
    await applyPushPreference();

    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.updates.some((u) => u.payload.active === false)).toBe(true);
  });

  it("does not deactivate other devices when this browser has no known endpoint", async () => {
    installBrowserPush("denied");
    pushManager.getSubscription.mockResolvedValueOnce(null);
    const { applyPushPreference } = await loadModule();
    await applyPushPreference();

    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.updates.some((u) => u.payload.active === false)).toBe(false);
    expect(state.audit).toContainEqual(
      expect.objectContaining({
        action: "permission_revoked",
        source: "reconcile.permission.no_local_endpoint",
      }),
    );
  });

  it("retires only this browser's previous endpoint while claiming the live one", async () => {
    localStorage.setItem("jet:web-push-endpoint", "https://push.example/endpoint-old");
    const { applyPushPreference } = await loadModule();
    await applyPushPreference();

    const retire = state.updates.find(
      (u) => u.table === "push_notifications" && u.payload.active === false,
    );
    expect(retire?.payload.active).toBe(false);
    expect(retire?.filters).toContainEqual(["eq", "endpoint", "https://push.example/endpoint-old"]);
    expect(retire?.filters.some(([op]) => op === "neq")).toBe(false);
  });

  it("does nothing when no user is signed in", async () => {
    state.user = null;
    const { applyPushPreference } = await loadModule();
    await applyPushPreference();

    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.updates).toHaveLength(0);
  });

  it("throttles repeated launch/foreground reconciliations but honours force", async () => {
    const { reconcilePushSubscription } = await loadModule();
    await reconcilePushSubscription(true);
    expect(state.rpc).toHaveBeenCalledTimes(1);

    await reconcilePushSubscription();
    expect(state.rpc).toHaveBeenCalledTimes(1);

    await reconcilePushSubscription(true);
    expect(state.rpc).toHaveBeenCalledTimes(2);
  });
});
