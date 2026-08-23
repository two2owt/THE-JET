import { useState } from "react";
import { DollarSign, AlertTriangle, History, Lock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

import {
  type MonetizationOverride,
  getMonetizationOverride,
  isMonetizationEnabled,
} from "@/lib/monetization";
import { useMonetization, useSetMonetization } from "@/hooks/useMonetization";

export {
  isMonetizationEnabled,
  getMonetizationOverride,
  type MonetizationOverride,
};

export const MonetizationToggle = () => {
  // Global, server-owned flag: reading it live means the badge below always
  // reflects what every other user's device is seeing right now.
  const { enabled, hydrated } = useMonetization();
  const setMonetization = useSetMonetization();
  const [isSaving, setIsSaving] = useState(false);
  const override: MonetizationOverride = enabled ? "enabled" : "disabled";

  const handleToggle = async (value: MonetizationOverride) => {
    if (isSaving || value === override) return;
    setIsSaving(true);
    try {
      await setMonetization(value === "enabled");
      toast.success(`Monetization ${value}`, {
        description: `Feature gating is now ${value} for all users and devices.`,
      });
    } catch {
      toast.error("Couldn't update monetization", {
        description: "Only admins can change this setting. Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Monetization Features</CardTitle>
              <CardDescription>
                Control subscription feature gating
              </CardDescription>
            </div>
          </div>
          {!hydrated ? (
            <Badge variant="outline">Loading…</Badge>
          ) : override === "enabled" ? (
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
              Active
            </Badge>
          ) : (
            <Badge variant="outline">Disabled</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div
            className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
              override === "enabled"
                ? "border-primary bg-primary/5"
                : "border-border/50 bg-background/50 backdrop-blur-sm hover:border-primary/50"
            }`}
            onClick={() => void handleToggle("enabled")}
          >
            <div>
              <p className="font-medium text-foreground">Enabled</p>
              <p className="text-sm text-muted-foreground">
                Subscription gating is active
              </p>
            </div>
            <Switch checked={override === "enabled"} disabled={isSaving} />
          </div>

          <div
            className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
              override === "disabled"
                ? "border-primary bg-primary/5"
                : "border-border/50 bg-background/50 backdrop-blur-sm hover:border-primary/50"
            }`}
            onClick={() => void handleToggle("disabled")}
          >
            <div>
              <p className="font-medium text-foreground">Disabled</p>
              <p className="text-sm text-muted-foreground">
                All features accessible to everyone
              </p>
            </div>
            <Switch checked={override === "disabled"} disabled={isSaving} />
          </div>
        </div>

        {override === "enabled" && (
          <div className="flex items-start gap-2 p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
            <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-yellow-200">
              Monetization active. Users without subscriptions will see upgrade
              prompts for JET+ and JETx features.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
