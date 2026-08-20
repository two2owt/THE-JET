import { useCallback, useEffect, useState } from "react";
import { BellOff, BellRing, History, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { PageLayout } from "@/components/PageLayout";
import { PageShell } from "@/components/PageShell";
import { TabPageHeader } from "@/components/TabPageHeader";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { supabase } from "@/integrations/supabase/client";
import { setConsent } from "@/lib/consent";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useWebPushNotifications } from "@/hooks/useWebPushNotifications";
import { openNotificationSettings } from "@/lib/openAppSettings";
import { applyPushPreference } from "@/hooks/usePushSubscriptionSync";
import {
  fetchPushAudit,
  logPushAudit,
  PUSH_AUDIT_LABELS,
  type PushAuditEntry,
} from "@/lib/push-audit";

/**
 * Standalone page where a user can see and change their push notification
 * preference. The switch is the single source of truth: it writes
 * `user_preferences.notifications_enabled` plus a `push_notifications` consent
 * row, then immediately reconciles this device's subscription.
 */
export default function NotificationSettings() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  // Change history is an admin-only diagnostic surface.
  const { isAdmin } = useIsAdmin();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [history, setHistory] = useState<PushAuditEntry[]>([]);

  const native = usePushNotifications();
  const web = useWebPushNotifications();
  const nativeMode = native.isNative;

  const permission = nativeMode ? native.permission : web.permission;
  const deviceRegistered = nativeMode ? native.isRegistered : web.isSubscribed;

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: pref }, { data: consentRows }] = await Promise.all([
      supabase
        .from("user_preferences")
        .select("notifications_enabled")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("user_consents")
        .select("granted")
        .eq("user_id", userId)
        .eq("consent_type", "push_notifications")
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    const prefOn = pref?.notifications_enabled !== false;
    const consentRow = consentRows?.[0];
    const consentOn = consentRow ? consentRow.granted === true : true;
    setEnabled(prefOn && consentOn);
    setLoading(false);
    setHistory(isAdmin ? await fetchPushAudit(userId) : []);
  }, [userId, isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleToggle = async (next: boolean) => {
    if (!userId) {
      toast.error("Sign in to manage alerts");
      return;
    }
    setSaving(true);
    setEnabled(next);
    try {
      const { error } = await supabase
        .from("user_preferences")
        .upsert(
          {
            user_id: userId,
            notifications_enabled: next,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
      if (error) throw error;

      await setConsent("push_notifications", next, "settings.notifications_page");
      await logPushAudit(
        userId,
        next ? "preference_enabled" : "preference_disabled",
        "settings.notifications_page",
        { platform: nativeMode ? "native" : "web" },
      );

      if (next) {
        if (nativeMode) {
          await native.enable();
        } else if (web.isSupported) {
          await web.subscribe();
        }
      } else if (nativeMode) {
        await native.disable();
      } else {
        await web.unsubscribe();
      }

      // Reconcile the stored subscription with the freshly saved preference.
      await applyPushPreference();
      toast.success(next ? "Push notifications on" : "Push notifications off");
    } catch (err) {
      console.error("[notifications] preference save failed", err);
      toast.error("Could not save your notification preference");
      setEnabled(!next);
    } finally {
      setSaving(false);
      void load();
    }
  };

  /**
   * Account preference is on but this browser/device has never been asked.
   * The account stays enabled by default; the user just needs to grant the
   * browser permission once so a token can be stored for this device.
   */
  const needsDevicePermission =
    !!userId && enabled && !deviceRegistered && permission === "default";

  const handleEnableThisDevice = async () => {
    setSaving(true);
    try {
      if (nativeMode) await native.enable();
      else if (web.isSupported) await web.subscribe();
      await applyPushPreference();
    } finally {
      setSaving(false);
      void load();
    }
  };

  const busy = saving || loading || web.isLoading || native.isLoading;

  return (
    <PageLayout defaultTab="notifications" headerConfig={{ hideSearch: true }}>
      <PageShell>
        <TabPageHeader
          title="Push notifications"
          subtitle="Choose whether JET can alert you about deals, favorites and messages."
        />

        <Card className="p-4 sm:p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-medium flex items-center gap-2">
                {enabled ? (
                  <BellRing className="h-4 w-4 text-primary" />
                ) : (
                  <BellOff className="h-4 w-4 text-muted-foreground" />
                )}
                Push notifications
              </p>
              <p className="text-xs text-muted-foreground max-w-prose">
                Saved to your account, so this choice follows you to every
                device the next time you sign in.
              </p>
            </div>
            {busy ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <Switch
                checked={enabled}
                onCheckedChange={handleToggle}
                disabled={!userId}
                aria-label="Toggle push notifications"
              />
            )}
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-1.5 text-xs text-muted-foreground">
            <p className="flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              Account preference:{" "}
              <span className="text-foreground font-medium">
                {enabled ? "Enabled" : "Disabled"}
              </span>
            </p>
            <p>
              This device:{" "}
              <span className="text-foreground font-medium">
                {deviceRegistered ? "Registered" : "Not registered"}
              </span>
            </p>
            <p>
              Device permission:{" "}
              <span className="text-foreground font-medium">{permission}</span>
            </p>
          </div>

          {permission === "denied" && (
            <div className="space-y-2">
              <p className="text-xs text-destructive">
                Notifications are blocked at the {nativeMode ? "device" : "browser"}{" "}
                level. Allow them for JET, then turn the switch back on.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void openNotificationSettings()}
              >
                Open notification settings
              </Button>
            </div>
          )}

          {needsDevicePermission && (
            <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <p className="text-xs text-muted-foreground">
                Alerts are on for your account, but this{" "}
                {nativeMode ? "device" : "browser"} hasn’t been registered yet.
                Allow notifications once and JET can reach you here too.
              </p>
              <Button
                type="button"
                size="sm"
                onClick={() => void handleEnableThisDevice()}
                disabled={busy}
              >
                Enable on this {nativeMode ? "device" : "browser"}
              </Button>
            </div>
          )}

          {!userId && (
            <p className="text-xs text-muted-foreground">
              Sign in to save your notification preference.
            </p>
          )}
        </Card>

        {isAdmin && (
        <Card className="mt-4 p-4 sm:p-5 space-y-3">
          <p className="text-sm font-medium flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            Change history
          </p>
          {history.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No changes recorded yet. Toggling notifications or a device
              subscription update will show up here.
            </p>
          ) : (
            <ul className="space-y-2">
              {history.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 p-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">
                      {PUSH_AUDIT_LABELS[entry.action] ?? entry.action}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {entry.platform ?? "web"} · {entry.source}
                      {entry.endpoint_tail ? ` · …${entry.endpoint_tail}` : ""}
                    </p>
                  </div>
                  <time
                    dateTime={entry.created_at}
                    className="shrink-0 text-[11px] text-muted-foreground"
                  >
                    {new Date(entry.created_at).toLocaleString()}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </Card>
        )}
      </PageShell>
    </PageLayout>
  );
}
