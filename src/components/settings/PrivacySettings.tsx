import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

interface PrivacySettingsProps {
  userId: string;
}

interface PrivacySettingsData {
  show_birthdate: boolean;
  show_gender: boolean;
  show_pronouns: boolean;
  show_bio: boolean;
  show_instagram: boolean;
  show_twitter: boolean;
  show_facebook: boolean;
  show_linkedin: boolean;
  show_tiktok: boolean;
  show_discoverable: boolean;
}

const defaultPrivacySettings: PrivacySettingsData = {
  show_birthdate: false,
  show_gender: true,
  show_pronouns: true,
  show_bio: true,
  show_instagram: true,
  show_twitter: true,
  show_facebook: true,
  show_linkedin: true,
  show_tiktok: true,
  show_discoverable: true,
};

const PrivacySettings = ({ userId }: PrivacySettingsProps) => {
  const [settings, setSettings] = useState<PrivacySettingsData>(defaultPrivacySettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalSettings, setOriginalSettings] = useState<PrivacySettingsData>(defaultPrivacySettings);

  useEffect(() => {
    loadPrivacySettings();
  }, [userId]);

  const loadPrivacySettings = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("privacy_settings")
        .eq("id", userId)
        .single();

      if (error) throw error;

      const privacySettings = (data?.privacy_settings as unknown as PrivacySettingsData) || defaultPrivacySettings;
      setSettings(privacySettings);
      setOriginalSettings(privacySettings);
    } catch (error) {
      console.error("Error loading privacy settings:", error);
      toast.error("Failed to load privacy settings");
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = (key: keyof PrivacySettingsData) => {
    const newSettings = { ...settings, [key]: !settings[key] };
    setSettings(newSettings);
    setHasChanges(JSON.stringify(newSettings) !== JSON.stringify(originalSettings));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Update both privacy_settings JSON and the discoverable column
      const { error } = await supabase
        .from("profiles")
        .update({ 
          privacy_settings: JSON.parse(JSON.stringify(settings)),
          discoverable: settings.show_discoverable
        })
        .eq("id", userId);

      if (error) throw error;

      setOriginalSettings(settings);
      setHasChanges(false);
      toast.success("Privacy settings saved");
    } catch (error) {
      console.error("Error saving privacy settings:", error);
      toast.error("Failed to save privacy settings");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const discoverabilityItem = { 
    key: "show_discoverable" as const, 
    label: "Discoverable", 
    description: "Allow others to find you in Discover People" 
  };

  const settingItems = [
    { key: "show_bio" as const, label: "Bio", description: "Show your bio to connections" },
    { key: "show_birthdate" as const, label: "Birthdate", description: "Show your birthdate to connections" },
    { key: "show_gender" as const, label: "Gender", description: "Show your gender to connections" },
    { key: "show_pronouns" as const, label: "Pronouns", description: "Show your pronouns to connections" },
  ];

  const socialItems = [
    { key: "show_instagram" as const, label: "Instagram", description: "Show your Instagram link" },
    { key: "show_twitter" as const, label: "Twitter/X", description: "Show your Twitter/X link" },
    { key: "show_facebook" as const, label: "Facebook", description: "Show your Facebook link" },
    { key: "show_linkedin" as const, label: "LinkedIn", description: "Show your LinkedIn link" },
    { key: "show_tiktok" as const, label: "TikTok", description: "Show your TikTok link" },
  ];

  return (
    <div className="space-y-4">
      {/* Discoverability */}
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Discoverability</p>
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
          <div className="space-y-0.5 flex-1 min-w-0">
            <label className="text-xs sm:text-sm font-medium text-foreground block">
              {discoverabilityItem.label}
            </label>
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              {discoverabilityItem.description}
            </p>
          </div>
          <Switch
            checked={settings[discoverabilityItem.key]}
            onCheckedChange={() => handleToggle(discoverabilityItem.key)}
            className="flex-shrink-0"
          />
        </div>
      </div>

      <Separator />

      {/* Profile Fields */}
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Profile Information</p>
        {settingItems.map((item) => (
          <div key={item.key} className="flex items-center justify-between gap-3">
            <div className="space-y-0.5 flex-1 min-w-0">
              <label className="text-xs sm:text-sm font-medium text-foreground block">
                {item.label}
              </label>
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                {item.description}
              </p>
            </div>
            <Switch
              checked={settings[item.key]}
              onCheckedChange={() => handleToggle(item.key)}
              className="flex-shrink-0"
            />
          </div>
        ))}
      </div>

      <Separator />

      {/* Social Links */}
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Social Links</p>
        {socialItems.map((item) => (
          <div key={item.key} className="flex items-center justify-between gap-3">
            <div className="space-y-0.5 flex-1 min-w-0">
              <label className="text-xs sm:text-sm font-medium text-foreground block">
                {item.label}
              </label>
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                {item.description}
              </p>
            </div>
            <Switch
              checked={settings[item.key]}
              onCheckedChange={() => handleToggle(item.key)}
              className="flex-shrink-0"
            />
          </div>
        ))}
      </div>

      {/* Save Button */}
      {hasChanges && (
        <div className="pt-4">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full rounded-full shadow-lg shadow-primary/20 font-semibold tracking-wide"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Privacy Settings
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
};

export default PrivacySettings;
