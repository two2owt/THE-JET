import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { PageLayout } from "@/components/PageLayout";
import { PageShell } from "@/components/PageShell";
import { TabPageHeader } from "@/components/TabPageHeader";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { setConsent } from "@/lib/consent";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useWebPushNotifications } from "@/hooks/useWebPushNotifications";
import { openNotificationSettings } from "@/lib/openAppSettings";
import { applyPushPreference } from "@/hooks/usePushSubscriptionSync";

/**
 * Standalone page where a user can see and change their push notification
 * preference. The switch is the single source of truth: it writes
 * `user_preferences.notifications_enabled` plus a `push_notifications` consent
 * row, then immediately reconciles this device's subscription.
 */
export default function NotificationSettings() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);

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
  }, [userId]);

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

  const busy = saving || loading || web.isLoading || native.isLoading;

  return (
    <PageLayout defaultTab="alerts" headerConfig={{ hideSearch: true }}>
      <PageShell>
        <TabPageHeader
          icon={Bell}
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

          {!userId && (
            <p className="text-xs text-muted-foreground">
              Sign in to save your notification preference.
            </p>
          )}
        </Card>
      </PageShell>
    </PageLayout>
  );
}
