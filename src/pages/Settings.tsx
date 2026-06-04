import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Bell, MapPin, Radio, Loader2, Save, Moon, Smartphone, User, Heart, Shield, CreditCard, ShieldCheck } from "lucide-react";

import { toast } from "sonner";
import { z } from "zod";
import { ReportIssueDialog } from "@/components/ReportIssueDialog";
import { usePushNotifications } from "@/hooks/usePushNotifications";

import PreferencesEditor from "@/components/settings/PreferencesEditor";
import PrivacySettings from "@/components/settings/PrivacySettings";
import ConsentCenter from "@/components/settings/ConsentCenter";
import { AccountSection } from "@/components/settings/AccountSection";
import { SubscriptionPlans } from "@/components/SubscriptionPlans";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { isMonetizationEnabled } from "@/lib/monetization";
import { PageLayout } from "@/components/PageLayout";
import { PageShell } from "@/components/PageShell";
import { SettingsPageSkeleton } from "@/components/skeletons/PageSkeletons";
import { PageTitle, SectionTitle } from "@/components/ui/page-title";
import { useAuth } from "@/contexts/AuthContext";
const preferencesSchema = z.object({
  notifications_enabled: z.boolean(),
  location_tracking_enabled: z.boolean(),
  background_tracking_enabled: z.boolean(),
});

interface UserPreferences {
  id: string;
  user_id: string;
  notifications_enabled: boolean;
  location_tracking_enabled: boolean;
  background_tracking_enabled: boolean;
}

interface SettingsProps {
  /** When true, skip the page layout chrome (header, page title, profile link card)
   *  so Settings can be embedded inside another page (e.g. Profile). */
  embedded?: boolean;
}

const Settings = ({ embedded = false }: SettingsProps = {}) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isRegistered: isPushRegistered, isNative, initializePushNotifications, unregister: unregisterPush } = usePushNotifications();
  const { isAdmin } = useIsAdmin();
  const { user, isLoading: isAuthLoading } = useAuth();
  const showSubscriptionSection = isMonetizationEnabled() || isAdmin;

  // Stable header config so PageLayout's effect doesn't churn on every render.
  const headerConfig = useMemo(() => ({ hideSearch: true }), []);

  // Handle subscription success/cancel from Stripe redirect
  useEffect(() => {
    const subscriptionStatus = searchParams.get("subscription");
    if (subscriptionStatus === "success") {
      toast.success("Subscription successful!", {
        description: "Thank you for subscribing to JET!",
      });
      // Clear the URL params
      window.history.replaceState({}, "", "/settings");
    } else if (subscriptionStatus === "canceled") {
      toast.info("Subscription canceled", {
        description: "You can subscribe anytime from settings.",
      });
      window.history.replaceState({}, "", "/settings");
    }
  }, [searchParams]);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const userId = user?.id ?? null;
  
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [pushNotificationsEnabled, setPushNotificationsEnabled] = useState(false);
  const [locationTrackingEnabled, setLocationTrackingEnabled] = useState(false);
  const [backgroundTrackingEnabled, setBackgroundTrackingEnabled] = useState(true);

  // Decoupled: load preferences once auth resolves.
  useEffect(() => {
    if (isAuthLoading) return;
    if (!user) {
      setIsLoading(false);
      return;
    }
    loadPreferences();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthLoading, user?.id]);

  // Sync push registration status independently — does not retrigger DB fetch.
  useEffect(() => {
    setPushNotificationsEnabled(isPushRegistered);
  }, [isPushRegistered]);

  // Track whether notification/location toggles diverge from saved preferences,
  // so the global Save button only appears when it actually has work to do.
  const hasUnsavedChanges = useMemo(() => {
    if (!preferences) return false;
    return (
      preferences.notifications_enabled !== notificationsEnabled ||
      preferences.location_tracking_enabled !== locationTrackingEnabled ||
      preferences.background_tracking_enabled !== backgroundTrackingEnabled
    );
  }, [preferences, notificationsEnabled, locationTrackingEnabled, backgroundTrackingEnabled]);

  const loadPreferences = async () => {
    try {
      if (!user) {
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error) {
        // If no preferences exist, create default ones
        if (error.code === 'PGRST116') {
          await createDefaultPreferences(user.id);
          return;
        }
        throw error;
      }

      if (data) {
        setPreferences(data);
        setNotificationsEnabled(data.notifications_enabled);
        setLocationTrackingEnabled(data.location_tracking_enabled);
        setBackgroundTrackingEnabled(data.background_tracking_enabled);
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
      toast.error('Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  };

  const createDefaultPreferences = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_preferences')
        .insert({
          user_id: userId,
          notifications_enabled: true,
          location_tracking_enabled: false,
          background_tracking_enabled: true,
        })
        .select()
        .single();

      if (error) throw error;

      setPreferences(data);
      setNotificationsEnabled(data.notifications_enabled);
      setLocationTrackingEnabled(data.location_tracking_enabled);
      setBackgroundTrackingEnabled(data.background_tracking_enabled);
    } catch (error) {
      console.error('Error creating preferences:', error);
      toast.error('Failed to initialize settings');
    }
  };

  const handleSaveSettings = async () => {
    if (!preferences) return;

    // Validate preferences
    try {
      preferencesSchema.parse({
        notifications_enabled: notificationsEnabled,
        location_tracking_enabled: locationTrackingEnabled,
        background_tracking_enabled: backgroundTrackingEnabled,
      });
    } catch (error) {
      toast.error('Invalid settings');
      return;
    }

    setIsSaving(true);

    try {
      const { error } = await supabase
        .from('user_preferences')
        .update({
          notifications_enabled: notificationsEnabled,
          location_tracking_enabled: locationTrackingEnabled,
          background_tracking_enabled: backgroundTrackingEnabled,
        })
        .eq('user_id', preferences.user_id);

      if (error) throw error;

      toast.success('Settings saved successfully');
      loadPreferences();
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePushNotificationToggle = async (enabled: boolean) => {
    try {
      if (enabled) {
        await initializePushNotifications();
        setPushNotificationsEnabled(true);
        toast.success('Push notifications enabled');
      } else {
        await unregisterPush();
        setPushNotificationsEnabled(false);
        toast.success('Push notifications disabled');
      }
    } catch (error) {
      console.error('Error toggling push notifications:', error);
      toast.error('Failed to update push notification settings');
    }
  };

  // Consistent layout wrapper for Settings page.
  // Settings is reached from the Crew (social) tab — keep that highlighted.
  const SettingsLayout = useCallback(
    ({ children }: { children: React.ReactNode }) =>
      embedded ? (
        <>{children}</>
      ) : (
        <PageLayout defaultTab="social" headerConfig={headerConfig}>
          {children}
        </PageLayout>
      ),
    [headerConfig, embedded]
  );

  if (isAuthLoading || isLoading) {
    return (
      <SettingsLayout>
        <SettingsPageSkeleton />
      </SettingsLayout>
    );
  }

  if (!user || !preferences) {
    return (
      <SettingsLayout>
        <PageShell variant="relaxed" className="!max-w-lg">
          <Card className="p-fluid-lg text-center bg-card/90 backdrop-blur-sm shadow-card">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-primary/15 to-accent/15 flex items-center justify-center mx-auto mb-fluid-md ring-1 ring-primary/20">
              <Bell className="w-6 h-6 sm:w-7 sm:h-7 text-primary" />
            </div>
            <p className="text-fluid-sm text-muted-foreground mb-fluid-md">Please sign in to access settings</p>
            <Button onClick={() => navigate("/auth")} variant="jet">
              Sign In
            </Button>
          </Card>
        </PageShell>
      </SettingsLayout>
    );
  }

  return (
    <SettingsLayout>
      <PageShell variant="relaxed" className="!max-w-3xl">
        {!embedded && (
          <PageTitle subtitle="Manage your account, preferences, and privacy.">
            Settings
          </PageTitle>
        )}

        {!embedded && (
          /* Profile Link — only shown when accessed as a standalone page */
          <Card className="p-4 sm:p-5 md:p-6 bg-card/90 backdrop-blur-sm shadow-card">
            <Button
              onClick={() => navigate("/profile")}
              variant="outline"
              className="w-full h-auto py-4 justify-start"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/15 to-accent/15 flex items-center justify-center">
                  <User className="w-5 h-5 text-primary" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-foreground">My Profile</div>
                  <div className="text-xs text-muted-foreground">View and edit your profile</div>
                </div>
              </div>
            </Button>
          </Card>
        )}

        {/* Subscription Section - visible when monetization is enabled OR user is admin */}
        {userId && showSubscriptionSection && (
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

        {/* Personal Preferences Section */}
        {userId && (
          <Card className="p-4 sm:p-5 md:p-6 space-y-4 sm:space-y-6 bg-card/90 backdrop-blur-sm shadow-card">
            <SectionTitle
              subtitle="Customize your interests for personalized recommendations"
              className="mb-0"
            >
              <span className="inline-flex items-center gap-2">
                <Heart className="w-5 h-5 text-primary" />
                Personal Preferences
              </span>
            </SectionTitle>

            <Separator />

            <PreferencesEditor userId={userId} />
          </Card>
        )}

        {/* Privacy Settings Section */}
        {userId && (
          <Card className="p-4 sm:p-5 md:p-6 space-y-4 sm:space-y-6 bg-card/90 backdrop-blur-sm shadow-card">
            <SectionTitle
              subtitle="Control what information is visible to your connections"
              className="mb-0"
            >
              <span className="inline-flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                Privacy Settings
              </span>
            </SectionTitle>

            <Separator />

            <PrivacySettings userId={userId} />
          </Card>
        )}

        {/* Notifications Section */}
        <Card className="p-4 sm:p-5 md:p-6 space-y-4 sm:space-y-6 bg-card/90 backdrop-blur-sm shadow-card">
          <SectionTitle
            subtitle="Manage how you receive alerts and updates"
            className="mb-0"
          >
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

            <Separator className="my-2" />

            {/* Only show native push notifications on iOS/Android */}
            {isNative && (
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
            )}
          </div>
        </Card>

        {/* Theme Section */}
        <Card className="p-4 sm:p-5 md:p-6 space-y-4 sm:space-y-6 bg-card/90 backdrop-blur-sm shadow-card">
          <SectionTitle
            subtitle="JET ships in a single, signature dark luxe theme."
            className="mb-0"
          >
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

        {/* Location Section */}
        <Card className="p-4 sm:p-5 md:p-6 space-y-4 sm:space-y-6 bg-card/90 backdrop-blur-sm shadow-card">
          <SectionTitle
            subtitle="Control how the app uses your location"
            className="mb-0"
          >
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

        {/* Privacy Info */}
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

        {/* Support Section */}
        <Card className="p-4 sm:p-5 md:p-6 space-y-4 sm:space-y-6 bg-card/90 backdrop-blur-sm shadow-card">
          <SectionTitle
            subtitle="Need help or found an issue?"
            className="mb-0"
          >
            Support
          </SectionTitle>

          <Separator />

          <div className="flex justify-center">
            <ReportIssueDialog />
          </div>
        </Card>

        {/* Account — email, password, and account deletion */}
        {userId && (
          <AccountSection userId={userId} currentEmail={user?.email} />
        )}

        {/* Save Button — only appears when notification/location toggles changed.
            Other sections (preferences, privacy, subscription, theme) save independently. */}
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
                <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2" />
                Save Notification &amp; Location Settings
              </>
            )}
          </Button>
        )}
      </PageShell>
    </SettingsLayout>
  );
};

export default Settings;
