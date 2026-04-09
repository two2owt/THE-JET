import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Bell, MapPin, Radio, Loader2, Save, Sun, Moon, Monitor, Smartphone, User, Heart, Shield, Trash2, CreditCard, ShieldCheck } from "lucide-react";

import { toast } from "sonner";
import { z } from "zod";
import { useTheme } from "next-themes";
import { ReportIssueDialog } from "@/components/ReportIssueDialog";
import { usePushNotifications } from "@/hooks/usePushNotifications";

import PreferencesEditor from "@/components/settings/PreferencesEditor";
import PrivacySettings from "@/components/settings/PrivacySettings";
import { DeleteAccountDialog } from "@/components/settings/DeleteAccountDialog";
import { SubscriptionPlans } from "@/components/SubscriptionPlans";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { isMonetizationEnabled } from "@/lib/monetization";
import { PageLayout } from "@/components/PageLayout";
import { SettingsPageSkeleton } from "@/components/skeletons/PageSkeletons";
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

const Settings = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { theme, setTheme } = useTheme();
  const { isRegistered: isPushRegistered, isNative, initializePushNotifications, unregister: unregisterPush } = usePushNotifications();
  const { isAdmin } = useIsAdmin();
  const showSubscriptionSection = isMonetizationEnabled() || isAdmin;

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
  const [userId, setUserId] = useState<string | null>(null);
  
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [pushNotificationsEnabled, setPushNotificationsEnabled] = useState(false);
  const [locationTrackingEnabled, setLocationTrackingEnabled] = useState(false);
  const [backgroundTrackingEnabled, setBackgroundTrackingEnabled] = useState(true);

  useEffect(() => {
    loadPreferences();
    // Check if push notifications are already registered
    setPushNotificationsEnabled(isPushRegistered);
  }, [isPushRegistered]);

  const loadPreferences = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user) {
        setIsLoading(false);
        return;
      }

      setUserId(session.user.id);

      const { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', session.user.id)
        .single();

      if (error) {
        // If no preferences exist, create default ones
        if (error.code === 'PGRST116') {
          await createDefaultPreferences(session.user.id);
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

  // Consistent layout wrapper for Settings page
  const SettingsLayout = ({ children }: { children: React.ReactNode }) => (
    <PageLayout defaultTab="map" headerConfig={{ hideSearch: true }}>
      {children}
    </PageLayout>
  );

  if (isLoading) {
    return (
      <SettingsLayout>
        <SettingsPageSkeleton />
      </SettingsLayout>
    );
  }

  if (!preferences) {
    return (
      <SettingsLayout>
        <div className="max-w-lg mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-fluid-lg">
          <Card className="p-fluid-lg text-center bg-card/90 backdrop-blur-sm shadow-card">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-primary/15 to-accent/15 flex items-center justify-center mx-auto mb-fluid-md ring-1 ring-primary/20">
              <Bell className="w-6 h-6 sm:w-7 sm:h-7 text-primary" />
            </div>
            <p className="text-fluid-sm text-muted-foreground mb-fluid-md">Please sign in to access settings</p>
            <Button onClick={() => navigate("/auth")} variant="jet">
              Sign In
            </Button>
          </Card>
        </div>
      </SettingsLayout>
    );
  }

  return (
    <SettingsLayout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-fluid-lg space-y-fluid-lg" style={{ maxWidth: '768px', marginLeft: 'auto', marginRight: 'auto', padding: 'clamp(16px, 3vw, 24px)', display: 'flex', flexDirection: 'column', gap: 'clamp(16px, 3vw, 24px)' }}>
        {/* Profile Link */}
        <Card className="p-4 sm:p-5 md:p-6 bg-card/90 backdrop-blur-sm shadow-card" style={{ padding: 'clamp(16px, 2.5vw, 24px)' }}>
          <Button
            onClick={() => navigate("/profile")}
            variant="outline"
            className="w-full h-auto py-4 justify-start"
          >
            <div className="flex items-center gap-3" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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

        {/* Subscription Section - visible when monetization is enabled OR user is admin */}
        {userId && showSubscriptionSection && (
          <Card className="p-4 sm:p-5 md:p-6 space-y-4 sm:space-y-6 bg-card/90 backdrop-blur-sm shadow-card" style={{ padding: 'clamp(16px, 2.5vw, 24px)', display: 'flex', flexDirection: 'column', gap: 'clamp(16px, 2vw, 24px)' }}>
            <div className="flex items-start justify-between gap-2" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
              <div>
                <div className="flex items-center gap-2 mb-1 sm:mb-2">
                  <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                  <h2 className="text-base sm:text-lg font-extrabold bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent">Subscription</h2>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Manage your JET subscription plan
                </p>
              </div>
              {isAdmin && !isMonetizationEnabled() && (
                <Badge variant="outline" className="flex items-center gap-1 text-xs border-primary/50 text-primary shrink-0">
                  <ShieldCheck className="w-3 h-3" />
                  Admin Only
                </Badge>
              )}
            </div>

            <Separator />

            <SubscriptionPlans />
          </Card>
        )}

        {/* Personal Preferences Section */}
        {userId && (
          <Card className="p-4 sm:p-5 md:p-6 space-y-4 sm:space-y-6 bg-card/90 backdrop-blur-sm shadow-card" style={{ padding: 'clamp(16px, 2.5vw, 24px)', display: 'flex', flexDirection: 'column', gap: 'clamp(16px, 2vw, 24px)' }}>
            <div>
              <div className="flex items-center gap-2 mb-1 sm:mb-2">
                <Heart className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                <h2 className="text-base sm:text-lg font-extrabold bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent">Personal Preferences</h2>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Customize your interests for personalized recommendations
              </p>
            </div>

            <Separator />

            <PreferencesEditor userId={userId} />
          </Card>
        )}

        {/* Privacy Settings Section */}
        {userId && (
          <Card className="p-4 sm:p-5 md:p-6 space-y-4 sm:space-y-6 bg-card/90 backdrop-blur-sm shadow-card" style={{ padding: 'clamp(16px, 2.5vw, 24px)', display: 'flex', flexDirection: 'column', gap: 'clamp(16px, 2vw, 24px)' }}>
            <div>
              <div className="flex items-center gap-2 mb-1 sm:mb-2">
                <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                <h2 className="text-base sm:text-lg font-extrabold bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent">Privacy Settings</h2>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Control what information is visible to your connections
              </p>
            </div>

            <Separator />

            <PrivacySettings userId={userId} />
          </Card>
        )}

        {/* Notifications Section */}
        <Card className="p-4 sm:p-5 md:p-6 space-y-4 sm:space-y-6 bg-card/90 backdrop-blur-sm shadow-card" style={{ padding: 'clamp(16px, 2.5vw, 24px)', display: 'flex', flexDirection: 'column', gap: 'clamp(16px, 2vw, 24px)' }}>
          <div>
            <div className="flex items-center gap-2 mb-1 sm:mb-2">
              <Bell className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
              <h2 className="text-base sm:text-lg font-extrabold bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent">Notifications</h2>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Manage how you receive alerts and updates
            </p>
          </div>

          <Separator />

          <div className="space-y-3 sm:space-y-4" style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(12px, 1.5vw, 16px)' }}>
            <div className="flex items-center justify-between gap-3" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div className="space-y-0.5 sm:space-y-1 flex-1 min-w-0" style={{ flex: '1 1 0%', minWidth: 0 }}>
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
              <div className="flex items-center justify-between gap-3" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div className="space-y-0.5 sm:space-y-1 flex-1 min-w-0" style={{ flex: '1 1 0%', minWidth: 0 }}>
                  <label htmlFor="push-notifications" className="text-xs sm:text-sm font-medium text-foreground flex items-center gap-1.5" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
        <Card className="p-4 sm:p-5 md:p-6 space-y-4 sm:space-y-6 bg-card/90 backdrop-blur-sm shadow-card" style={{ padding: 'clamp(16px, 2.5vw, 24px)', display: 'flex', flexDirection: 'column', gap: 'clamp(16px, 2vw, 24px)' }}>
          <div>
            <div className="flex items-center gap-2 mb-1 sm:mb-2">
              <Sun className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
              <h2 className="text-base sm:text-lg font-extrabold bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent">Appearance</h2>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Choose how the app looks
            </p>
          </div>

          <Separator />

          <div className="space-y-2 sm:space-y-3">
            <button
              onClick={() => setTheme("light")}
              className={`w-full flex items-center justify-between p-3 sm:p-4 rounded-lg border-2 transition-all ${
                theme === "light" 
                  ? "border-primary bg-primary/5" 
                  : "border-border hover:border-primary/50"
              }`}
            >
              <div className="flex items-center gap-2 sm:gap-3">
                <Sun className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                <div className="text-left">
                  <div className="text-sm sm:text-base font-medium text-foreground">Light</div>
                  <div className="text-[10px] sm:text-xs text-muted-foreground">Bright theme for daytime</div>
                </div>
              </div>
              {theme === "light" && (
                <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-primary flex-shrink-0" />
              )}
            </button>

            <button
              onClick={() => setTheme("dark")}
              className={`w-full flex items-center justify-between p-3 sm:p-4 rounded-lg border-2 transition-all ${
                theme === "dark" 
                  ? "border-primary bg-primary/5" 
                  : "border-border hover:border-primary/50"
              }`}
            >
              <div className="flex items-center gap-2 sm:gap-3">
                <Moon className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                <div className="text-left">
                  <div className="text-sm sm:text-base font-medium text-foreground">Dark</div>
                  <div className="text-[10px] sm:text-xs text-muted-foreground">Dark theme for nighttime</div>
                </div>
              </div>
              {theme === "dark" && (
                <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-primary flex-shrink-0" />
              )}
            </button>

            <button
              onClick={() => setTheme("system")}
              className={`w-full flex items-center justify-between p-3 sm:p-4 rounded-lg border-2 transition-all ${
                theme === "system" 
                  ? "border-primary bg-primary/5" 
                  : "border-border hover:border-primary/50"
              }`}
            >
              <div className="flex items-center gap-2 sm:gap-3">
                <Monitor className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                <div className="text-left">
                  <div className="text-sm sm:text-base font-medium text-foreground">Auto</div>
                  <div className="text-[10px] sm:text-xs text-muted-foreground">Matches your device theme</div>
                </div>
              </div>
              {theme === "system" && (
                <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-primary flex-shrink-0" />
              )}
            </button>
          </div>
        </Card>

        {/* Location Section */}
        <Card className="p-4 sm:p-5 md:p-6 space-y-4 sm:space-y-6 bg-card/90 backdrop-blur-sm shadow-card">
          <div>
            <div className="flex items-center gap-2 mb-1 sm:mb-2">
              <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
              <h2 className="text-base sm:text-lg font-extrabold bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent">Location</h2>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Control how the app uses your location
            </p>
          </div>

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
        <Card className="p-4 sm:p-5 md:p-6 bg-muted/80 backdrop-blur-sm shadow-card">
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
          <div>
            <h2 className="text-base sm:text-lg font-extrabold bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent">Support</h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Need help or found an issue?
            </p>
          </div>

          <Separator />

          <div className="flex justify-center">
            <ReportIssueDialog />
          </div>
        </Card>

        {/* Danger Zone - Account Deletion */}
        {userId && (
          <Card className="p-4 sm:p-5 md:p-6 space-y-4 sm:space-y-6 border-destructive/30 bg-card/90 backdrop-blur-xl shadow-card">
            <div>
              <div className="flex items-center gap-2 mb-1 sm:mb-2">
                <Trash2 className="w-4 h-4 sm:w-5 sm:h-5 text-destructive" />
                <h2 className="text-base sm:text-lg font-bold text-destructive">Danger Zone</h2>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Permanently delete your account and all associated data
              </p>
            </div>

            <Separator />

            <DeleteAccountDialog userId={userId} />
          </Card>
        )}

        {/* Save Button */}
        <Button
          onClick={handleSaveSettings}
          disabled={isSaving}
          className="w-full text-sm sm:text-base"
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
              Save Settings
            </>
          )}
        </Button>
      </div>
    </SettingsLayout>
  );
};

export default Settings;
