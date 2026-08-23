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
import { useMonetizationAudit } from "@/hooks/useMonetizationAudit";
import { useIsAdmin } from "@/hooks/useIsAdmin";

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
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const { entries: auditEntries, refresh: refreshAudit } = useMonetizationAudit(
    isAdmin && !adminLoading,
  );
  const [isSaving, setIsSaving] = useState(false);
  const override: MonetizationOverride = enabled ? "enabled" : "disabled";
  const canEdit = isAdmin && !adminLoading;

  const handleToggle = async (value: MonetizationOverride) => {
    if (isSaving || value === override) return;
    if (!canEdit) {
      toast.error("Admin access required", {
        description: "Only admins can change monetization for all users.",
      });
      return;
    }
    setIsSaving(true);
    try {
      await setMonetization(value === "enabled");
      void refreshAudit();
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
          {(
            [
              {
                value: "enabled" as const,
                label: "Enabled",
                hint: "Subscription gating is active",
              },
              {
                value: "disabled" as const,
                label: "Disabled",
                hint: "All features accessible to everyone",
              },
            ]
          ).map((option) => (
            <div
              key={option.value}
              role="button"
              tabIndex={canEdit ? 0 : -1}
              aria-disabled={!canEdit}
              className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                canEdit ? "cursor-pointer" : "cursor-not-allowed opacity-70"
              } ${
                override === option.value
                  ? "border-primary bg-primary/5"
                  : "border-border/50 bg-background/50 backdrop-blur-sm hover:border-primary/50"
              }`}
              onClick={() => void handleToggle(option.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  void handleToggle(option.value);
                }
              }}
            >
              <div>
                <p className="font-medium text-foreground">{option.label}</p>
                <p className="text-sm text-muted-foreground">{option.hint}</p>
              </div>
              <Switch
                checked={override === option.value}
                disabled={isSaving || !canEdit}
                aria-label={`Set monetization ${option.value}`}
              />
            </div>
          ))}
        </div>

        {!adminLoading && !isAdmin && (
          <div className="flex items-start gap-2 p-3 rounded-lg border border-border/60 bg-muted/30">
            <Lock className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <p className="text-sm text-muted-foreground">
              Read-only. Only admins can change monetization; the database
              rejects writes from everyone else.
            </p>
          </div>
        )}

        {override === "enabled" && (
          <div className="flex items-start gap-2 p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
            <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-yellow-200">
              Monetization active. Users without subscriptions will see upgrade
              prompts for JET+ and JETx features.
            </p>
          </div>
        )}

        {canEdit && (
          <div className="pt-2 border-t border-border/50">
            <div className="flex items-center gap-2 mb-2">
              <History className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">
                Change history
              </p>
            </div>
            {auditEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No changes recorded yet.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {auditEntries.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="text-muted-foreground truncate">
                      {entry.from === null
                        ? "Set to"
                        : `${entry.from ? "Enabled" : "Disabled"} →`}{" "}
                      <span
                        className={
                          entry.to ? "text-green-400" : "text-foreground"
                        }
                      >
                        {entry.to ? "Enabled" : "Disabled"}
                      </span>
                      {entry.changedByName ? ` by ${entry.changedByName}` : ""}
                    </span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(entry.changedAt).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
