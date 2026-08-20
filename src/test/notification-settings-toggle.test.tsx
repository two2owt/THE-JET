import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

type Upsert = { table: string; payload: Record<string, unknown> };

const state = {
  pref: { notifications_enabled: true } as { notifications_enabled: boolean },
  consent: [{ granted: true }] as Array<{ granted: boolean }>,
  upserts: [] as Upsert[],
  audit: [] as Array<Record<string, unknown>>,
  auditRows: [] as Array<Record<string, unknown>>,
};

const { setConsent, applyPushPreference, webSubscribe, webUnsubscribe } = vi.hoisted(() => ({
  setConsent: vi.fn(async () => undefined),
  applyPushPreference: vi.fn(async () => undefined),
  webSubscribe: vi.fn(async () => undefined),
  webUnsubscribe: vi.fn(async () => undefined),
}));

function selectBuilder(rows: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit"]) chain[m] = () => chain;
  chain["maybeSingle"] = async () => ({ data: rows, error: null });
  chain["then"] = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: () =>
        selectBuilder(
          table === "user_consents"
            ? state.consent
            : table === "push_notification_audit"
              ? state.auditRows
              : state.pref,
        ),
      insert: async (payload: Record<string, unknown>) => {
        state.audit.push(payload);
        return { error: null };
      },
      upsert: async (payload: Record<string, unknown>) => {
        state.upserts.push({ table, payload });
        return { error: null };
      },
    }),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ session: { user: { id: "user-1" } } }),
}));
vi.mock("@/lib/consent", () => ({ setConsent }));
vi.mock("@/hooks/usePushSubscriptionSync", () => ({ applyPushPreference }));
vi.mock("@/hooks/usePushNotifications", () => ({
  usePushNotifications: () => ({
    isNative: false,
    permission: "granted",
    isRegistered: false,
    isLoading: false,
    enable: vi.fn(),
    disable: vi.fn(),
  }),
}));
vi.mock("@/hooks/useWebPushNotifications", () => ({
  useWebPushNotifications: () => ({
    permission: "granted",
    isSubscribed: true,
    isSupported: true,
    isLoading: false,
    subscribe: webSubscribe,
    unsubscribe: webUnsubscribe,
  }),
}));
vi.mock("@/lib/openAppSettings", () => ({ openNotificationSettings: vi.fn() }));
vi.mock("@/components/PageLayout", () => ({
  PageLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/PageShell", () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/TabPageHeader", () => ({
  TabPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import NotificationSettings from "@/pages/NotificationSettings";

async function renderPage() {
  render(<NotificationSettings />);
  return await screen.findByRole("switch", { name: /toggle push notifications/i });
}

describe("notification settings toggle", () => {
  beforeEach(() => {
    state.pref = { notifications_enabled: true };
    state.consent = [{ granted: true }];
    state.upserts = [];
    state.audit = [];
    state.auditRows = [];
    setConsent.mockClear();
    applyPushPreference.mockClear();
    webSubscribe.mockClear();
    webUnsubscribe.mockClear();
  });

  it("reflects the saved preference when it is enabled", async () => {
    const toggle = await renderPage();
    await waitFor(() => expect(toggle).toBeChecked());
  });

  it("shows off when the stored consent is revoked", async () => {
    state.consent = [{ granted: false }];
    const toggle = await renderPage();
    await waitFor(() => expect(toggle).not.toBeChecked());
  });

  it("shows off when the master preference is disabled", async () => {
    state.pref = { notifications_enabled: false };
    const toggle = await renderPage();
    await waitFor(() => expect(toggle).not.toBeChecked());
  });

  it("turning it off persists the preference and unsubscribes the device", async () => {
    const toggle = await renderPage();
    await waitFor(() => expect(toggle).toBeChecked());

    await userEvent.click(toggle);

    await waitFor(() =>
      expect(state.upserts).toContainEqual(
        expect.objectContaining({
          table: "user_preferences",
          payload: expect.objectContaining({ notifications_enabled: false }),
        }),
      ),
    );
    expect(setConsent).toHaveBeenCalledWith("push_notifications", false, expect.any(String));
    expect(webUnsubscribe).toHaveBeenCalled();
    expect(webSubscribe).not.toHaveBeenCalled();
    expect(applyPushPreference).toHaveBeenCalled();
    await waitFor(() =>
      expect(state.audit).toContainEqual(
        expect.objectContaining({ action: "preference_disabled" }),
      ),
    );
  });

  it("turning it on persists the preference and subscribes the device", async () => {
    state.pref = { notifications_enabled: false };
    state.consent = [{ granted: false }];
    const toggle = await renderPage();
    await waitFor(() => expect(toggle).not.toBeChecked());

    await userEvent.click(toggle);

    await waitFor(() =>
      expect(state.upserts).toContainEqual(
        expect.objectContaining({
          table: "user_preferences",
          payload: expect.objectContaining({ notifications_enabled: true }),
        }),
      ),
    );
    expect(setConsent).toHaveBeenCalledWith("push_notifications", true, expect.any(String));
    expect(webSubscribe).toHaveBeenCalled();
    expect(webUnsubscribe).not.toHaveBeenCalled();
    expect(applyPushPreference).toHaveBeenCalled();
    await waitFor(() =>
      expect(state.audit).toContainEqual(
        expect.objectContaining({
          action: "preference_enabled",
          source: "settings.notifications_page",
        }),
      ),
    );
  });

  it("renders recorded audit history entries", async () => {
    state.auditRows = [
      {
        id: "a1",
        action: "preference_disabled",
        source: "settings.notifications_page",
        platform: "web",
        endpoint_tail: "abc123",
        detail: null,
        created_at: new Date("2026-08-20T12:00:00Z").toISOString(),
      },
    ];
    await renderPage();
    expect(await screen.findByText(/Turned notifications off/i)).toBeInTheDocument();
  });
});
