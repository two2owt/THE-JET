import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/ui/page-title";
import { Bell, MapPin, Heart, Shield, ShieldCheck, CreditCard, Moon, Smartphone, Loader2, Save, Radio } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import PreferencesEditor from "@/components/settings/PreferencesEditor";
import PrivacySettings from "@/components/settings/PrivacySettings";
import ConsentCenter from "@/components/settings/ConsentCenter";
import { AccountSection } from "@/components/settings/AccountSection";
import { SubscriptionPlans } from "@/components/SubscriptionPlans";
import { ReportIssueDialog } from "@/components/ReportIssueDialog";

import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { isMonetizationEnabled } from "@/lib/monetization";

const preferencesSchema = z.object({
  notifications_enabled: z.boolean(),
  location_tracking_enabled: z.boolean(),
  background_tracking_enabled: z.boolean(),
});

interface UserPreferencesRow {
  id: string;
  user_id: string;
  notifications_enabled: boolean;
  location_tracking_enabled: boolean;
  background_tracking_enabled: boolean;
}

interface ProfileSettingsPanelProps {
  userId: string;
  userEmail?: string | null;
}

/**
 * Full settings surface (preferences, privacy, consent, notifications, theme,
 * location, subscription, support, account) rendered inline inside /profile
 * when the user enters edit mode. Consolidated into the Profile page.
 */
export function ProfileSettingsPanel({ userId, userEmail }: ProfileSettingsPanelProps) {
  const { isRegistered: isPushRegistered, isNative, initializePushNotifications, unregister: unregisterPush } = usePushNotifications();
  const { isAdmin } = useIsAdmin();
  const showSubscriptionSection = isMonetizationEnabled() || isAdmin;

  const [preferences, setPreferences] = useState<UserPreferencesRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [pushNotificationsEnabled, setPushNotificationsEnabled] = useState(false);
  const [locationTrackingEnabled, setLocationTrackingEnabled] = useState(false);
  const [backgroundTrackingEnabled, setBackgroundTrackingEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from("user_preferences")
          .select("*")
          .eq("user_id", userId)
          .single();

        if (error && error.code !== "PGRST116") throw error;

        let row = data as UserPreferencesRow | null;
        if (!row) {
          const insert = await supabase
            .from("user_preferences")
            .insert({
              user_id: userId,
              notifications_enabled: true,
              location_tracking_enabled: false,
              background_tracking_enabled: true,
            })
            .select()
            .single();
          if (insert.error) throw insert.error;
          row = insert.data as UserPreferencesRow;
        }

        if (cancelled || !row) return;
        setPreferences(row);
        setNotificationsEnabled(row.notifications_enabled);
        setLocationTrackingEnabled(row.location_tracking_enabled);
        setBackgroundTrackingEnabled(row.background_tracking_enabled);
      } catch (err) {
        console.error("Error loading preferences:", err);
        if (!cancelled) toast.error("Failed to load settings");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    setPushNotificationsEnabled(isPushRegistered);
  }, [isPushRegistered]);

  const hasUnsavedChanges = useMemo(() => {
    if (!preferences) return false;
    return (
      preferences.notifications_enabled !== notificationsEnabled ||
      preferences.location_tracking_enabled !== locationTrackingEnabled ||
      preferences.background_tracking_enabled !== backgroundTrackingEnabled
    );
  }, [preferences, notificationsEnabled, locationTrackingEnabled, backgroundTrackingEnabled]);

  const handleSaveSettings = async () => {
    if (!preferences) return;
    try {
      preferencesSchema.parse({
        notifications_enabled: notificationsEnabled,
        location_tracking_enabled: locationTrackingEnabled,
        background_tracking_enabled: backgroundTrackingEnabled,
      });
    } catch {
      toast.error("Invalid settings");
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("user_preferences")
        .update({
          notifications_enabled: notificationsEnabled,
          location_tracking_enabled: locationTrackingEnabled,
          background_tracking_enabled: backgroundTrackingEnabled,
        })
        .eq("user_id", preferences.user_id);
      if (error) throw error;

      setPreferences({
        ...preferences,
        notifications_enabled: notificationsEnabled,
        location_tracking_enabled: locationTrackingEnabled,
        background_tracking_enabled: backgroundTrackingEnabled,
      });
      toast.success("Settings saved");
    } catch (err) {
      console.error("Error saving settings:", err);
      toast.error("Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePushNotificationToggle = async (enabled: boolean) => {
    try {
      if (enabled) {
        await initializePushNotifications();
        setPushNotificationsEnabled(true);
        toast.success("Push notifications enabled");
      } else {
        await unregisterPush();
        setPushNotificationsEnabled(false);
        toast.success("Push notifications disabled");
      }
    } catch (err) {
      console.error("Push toggle failed:", err);
      toast.error("Failed to update push notification settings");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ gap: "var(--space-md)" }}>
      {/* Subscription */}
      {showSubscriptionSection && (
        <Card className="p-4 sm:p-5 md:p-6 space-y-4 sm:space-y-6 bg-card/90 backdrop-blur-sm shadow-card">
          <SectionTitle
            subtitle="Manage your JET subscription plan"
            meta={isAdmin && !isMonetizationEnabled() ? (
              <Badge variant="outline" className="flex items-center gap-1 text-xs border-primary/50 text-primary shrink-0">
                <ShieldCheck className="w-3 h-3" />
                Admin Only
              </Badge>
            ) : undefined}
            className="mb-0"
          >
            <span className="inline-flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-primary" />
              Subscription
            </span>
          </SectionTitle>
          <Separator />
          <SubscriptionPlans />
        </Card>
      )}

      {/* Personal Preferences */}
      <Card className="p-4 sm:p-5 md:p-6 space-y-4 sm:space-y-6 bg-card/90 backdrop-blur-sm shadow-card">
        <SectionTitle subtitle="Customize your interests for personalized recommendations" className="mb-0">
          <span className="inline-flex items-center gap-2">
            <Heart className="w-5 h-5 text-primary" />
            Personal Preferences
          </span>
        </SectionTitle>
        <Separator />
        <PreferencesEditor userId={userId} />
      </Card>

      {/* Privacy */}
      <Card className="p-4 sm:p-5 md:p-6 space-y-4 sm:space-y-6 bg-card/90 backdrop-blur-sm shadow-card">
        <SectionTitle subtitle="Control what information is visible to your connections" className="mb-0">
          <span className="inline-flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Privacy Settings
          </span>
        </SectionTitle>
        <Separator />
        <PrivacySettings userId={userId} />
      </Card>

      {/* Consent */}
      <Card className="p-4 sm:p-5 md:p-6 space-y-4 sm:space-y-6 bg-card/90 backdrop-blur-sm shadow-card">
        <SectionTitle subtitle="Granular, versioned consent for location, notifications, and analytics" className="mb-0">
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Consent Center
          </span>
        </SectionTitle>
        <Separator />
        <ConsentCenter userId={userId} />
      </Card>

      {/* Notifications */}
      <Card className="p-4 sm:p-5 md:p-6 space-y-4 sm:space-y-6 bg-card/90 backdrop-blur-sm shadow-card">
        <SectionTitle subtitle="Manage how you receive alerts and updates" className="mb-0">
          <span className="inline-flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            Notifications
          </span>
        </SectionTitle>
        <Separator />
        <div className="space-y-3 sm:space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5 sm:space-y-1 flex-1 min-w-0">
              <label htmlFor="notifications" className="text-xs sm:text-sm font-medium text-foreground block">
                App Notifications
              </label>
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                Show in-app notifications about deals and events
              </p>
            </div>
            <Switch
              id="notifications"
              checked={notificationsEnabled}
              onCheckedChange={setNotificationsEnabled}
              className="flex-shrink-0"
            />
          </div>
          {isNative && (
            <>
              <Separator className="my-2" />
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5 sm:space-y-1 flex-1 min-w-0">
                  <label htmlFor="push-notifications" className="text-xs sm:text-sm font-medium text-foreground flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5" />
                    Native Push Notifications
                  </label>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">
                    Receive notifications even when the app is closed
                  </p>
                </div>
                <Switch
                  id="push-notifications"
                  checked={pushNotificationsEnabled}
                  onCheckedChange={handlePushNotificationToggle}
                  className="flex-shrink-0"
                />
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Appearance */}
      <Card className="p-4 sm:p-5 md:p-6 space-y-4 sm:space-y-6 bg-card/90 backdrop-blur-sm shadow-card">
        <SectionTitle subtitle="JET ships in a single, signature dark luxe theme." className="mb-0">
          <span className="inline-flex items-center gap-2">
            <Moon className="w-5 h-5 text-gold" />
            Appearance
          </span>
        </SectionTitle>
        <div className="divider-luxe" />
        <div className="flex items-center gap-3 p-3 sm:p-4 rounded-xl border-hairline bg-popover/40">
          <div className="shrink-0 w-9 h-9 rounded-full bg-gradient-gold/10 ring-1 ring-gold/30 flex items-center justify-center">
            <Moon className="w-4 h-4 text-gold" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">Dark Luxe</p>
            <p className="text-xs text-muted-foreground">
              Near-black surfaces, hairline borders, soft ambient glow.
            </p>
          </div>
          <span className="dot-gold" aria-hidden="true" />
        </div>
      </Card>

      {/* Location */}
      <Card className="p-4 sm:p-5 md:p-6 space-y-4 sm:space-y-6 bg-card/90 backdrop-blur-sm shadow-card">
        <SectionTitle subtitle="Control how the app uses your location" className="mb-0">
          <span className="inline-flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            Location
          </span>
        </SectionTitle>
        <Separator />
        <div className="space-y-3 sm:space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5 sm:space-y-1 flex-1 min-w-0">
              <label htmlFor="location-tracking" className="text-xs sm:text-sm font-medium text-foreground block">
                Location Tracking
              </label>
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                Allow the app to track your location for nearby deals
              </p>
            </div>
            <Switch
              id="location-tracking"
              checked={locationTrackingEnabled}
              onCheckedChange={setLocationTrackingEnabled}
              className="flex-shrink-0"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5 sm:space-y-1 flex-1 min-w-0">
              <label htmlFor="background-tracking" className="text-xs sm:text-sm font-medium text-foreground block">
                Background Tracking
              </label>
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                Continue tracking location when app is in background
              </p>
            </div>
            <Switch
              id="background-tracking"
              checked={backgroundTrackingEnabled}
              onCheckedChange={setBackgroundTrackingEnabled}
              disabled={!locationTrackingEnabled}
              className="flex-shrink-0"
            />
          </div>
        </div>
      </Card>

      {/* Privacy Notice */}
      <Card className="p-4 sm:p-5 md:p-6 bg-card/90 backdrop-blur-sm border border-border/50 shadow-card">
        <div className="flex items-start gap-2 sm:gap-3">
          <Radio className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="space-y-1 sm:space-y-2 flex-1 min-w-0">
            <h3 className="text-xs sm:text-sm font-medium text-foreground">Privacy Notice</h3>
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              Your location data is used solely to provide personalized recommendations and notifications.
              We never share your data with third parties without your explicit consent.
            </p>
          </div>
        </div>
      </Card>

      {/* Support */}
      <Card className="p-4 sm:p-5 md:p-6 space-y-4 sm:space-y-6 bg-card/90 backdrop-blur-sm shadow-card">
        <SectionTitle subtitle="Need help or found an issue?" className="mb-0">
          Support
        </SectionTitle>
        <Separator />
        <div className="flex justify-center">
          <ReportIssueDialog />
        </div>
      </Card>

      {/* Account */}
      <AccountSection userId={userId} currentEmail={userEmail ?? undefined} />

      {/* Save notification/location toggles */}
      {hasUnsavedChanges && (
        <Button
          onClick={handleSaveSettings}
          disabled={isSaving}
          className="w-full text-sm sm:text-base rounded-full shadow-lg shadow-primary/20 font-semibold tracking-wide"
          size="lg"
          variant="jet"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Save Notification &amp; Location Settings
            </>
          )}
        </Button>
      )}
    </div>
  );
}

export default ProfileSettingsPanel;