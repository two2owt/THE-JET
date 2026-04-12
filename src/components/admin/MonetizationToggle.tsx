import { useState, useEffect } from "react";
import { DollarSign, AlertTriangle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

import {
  type MonetizationOverride,
  getMonetizationOverride,
  setMonetizationOverride,
  isMonetizationEnabled,
} from "@/lib/monetization";

export { isMonetizationEnabled, getMonetizationOverride, type MonetizationOverride };

export const MonetizationToggle = () => {
  const [override, setOverride] = useState<MonetizationOverride>("disabled");

  useEffect(() => {
    setOverride(getMonetizationOverride());
  }, []);

  const handleToggle = (value: MonetizationOverride) => {
    setOverride(value);
    setMonetizationOverride(value);
    toast.success(`Monetization ${value}`, {
      description: `Feature gating is now ${value}`,
    });
    window.location.reload();
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
          {override === "enabled" ? (
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Active</Badge>
          ) : (
            <Badge variant="outline">Disabled</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div 
            className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
              override === "enabled" ? "border-primary bg-primary/5" : "border-border/50 bg-background/50 backdrop-blur-sm hover:border-primary/50"
            }`}
            onClick={() => handleToggle("enabled")}
          >
            <div>
              <p className="font-medium text-foreground">Enabled</p>
              <p className="text-sm text-muted-foreground">Subscription gating is active</p>
            </div>
            <Switch checked={override === "enabled"} />
          </div>

          <div 
            className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
              override === "disabled" ? "border-primary bg-primary/5" : "border-border/50 bg-background/50 backdrop-blur-sm hover:border-primary/50"
            }`}
            onClick={() => handleToggle("disabled")}
          >
            <div>
              <p className="font-medium text-foreground">Disabled</p>
              <p className="text-sm text-muted-foreground">All features accessible to everyone</p>
            </div>
            <Switch checked={override === "disabled"} />
          </div>
        </div>

        {override === "enabled" && (
          <div className="flex items-start gap-2 p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
            <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-yellow-200">
              Monetization active. Users without subscriptions will see upgrade prompts for JET+ and JETx features.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
