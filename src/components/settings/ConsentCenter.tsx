import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin, Radio, Bell, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { refreshConsents } from "@/lib/consent";

/**
 * Current policy version for the consent surface. Bump when the wording
 * or scope of any consent materially changes so old grants can be
 * distinguished from new ones in the audit history.
 */
const POLICY_VERSION = "2025-06";

type ConsentType =
  | "foreground_location"
  | "background_tracking"
  | "push_notifications"
  | "messaging_analytics";

interface ConsentRow {
  consent_type: ConsentType;
  granted: boolean;
  policy_version: string;
  granted_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

interface ConsentItem {
  type: ConsentType;
  label: string;
  description: string;
  Icon: typeof MapPin;
}

const ITEMS: ConsentItem[] = [
  {
    type: "foreground_location",
    label: "Location tracking",
    description:
      "While the app is open, we use your location to show nearby deals, venues, and friends on the map. Turn this off and the map will center on your default city instead.",
    Icon: MapPin,
  },
  {
    type: "background_tracking",
    label: "Background location",
    description:
      "When the app is closed, we still check your location so we can send a push alert if you walk or drive near a hot deal. For example, if a flash deal drops near your office while your phone is in your pocket, you'll get notified instantly.",
    Icon: Radio,
  },
  {
    type: "push_notifications",
    label: "Push notifications",
    description:
      "Get push alerts for new deals near you, friend activity, and time-sensitive offers. You can turn this off anytime.",
    Icon: Bell,
  },
  {
    type: "messaging_analytics",
    label: "Messaging insights",
    description:
      "Share anonymous activity from your chats (never the message content) to help us keep messaging safe and improve the experience.",
    Icon: MessageSquare,
  },
];

interface ConsentCenterProps {
  userId: string;
}

export const ConsentCenter = ({ userId }: ConsentCenterProps) => {
  const [latest, setLatest] = useState<Record<ConsentType, ConsentRow | null>>({
    foreground_location: null,
    background_tracking: null,
    push_notifications: null,
    messaging_analytics: null,
  });
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<ConsentType | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("user_consents")
      .select("consent_type, granted, policy_version, granted_at, revoked_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Failed to load consents", error);
      toast.error("Failed to load consent center");
      setLoading(false);
      return;
    }
    const next: Record<ConsentType, ConsentRow | null> = {
      foreground_location: null,
      background_tracking: null,
      push_notifications: null,
      messaging_analytics: null,
    };
    for (const row of (data ?? []) as ConsentRow[]) {
      if (!next[row.consent_type]) next[row.consent_type] = row;
    }
    setLatest(next);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggle = async (type: ConsentType, nextGranted: boolean) => {
    setPending(type);
    const now = new Date().toISOString();
    const { error } = await supabase.from("user_consents").insert({
      user_id: userId,
      consent_type: type,
      granted: nextGranted,
      policy_version: POLICY_VERSION,
      source: "settings.consent_center",
      granted_at: nextGranted ? now : null,
      revoked_at: nextGranted ? null : now,
    });
    if (error) {
      console.error("Failed to record consent", error);
      toast.error("Could not save your choice");
      setPending(null);
      return;
    }
    toast.success(nextGranted ? "Consent granted" : "Consent revoked");
    setPending(null);
    load();
    // Keep the runtime guard cache in sync so features react immediately
    refreshConsents().catch(() => undefined);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString() : null;

  return (
    <div className="space-y-4">
      <p className="text-[11px] sm:text-xs text-muted-foreground">
        Each choice is recorded with the active policy version and a timestamp.
        Toggling a consent appends a new record — the full history is preserved
        for audit.
      </p>

      {ITEMS.map((item, idx) => {
        const row = latest[item.type];
        const granted = row?.granted ?? false;
        const ts = granted ? row?.granted_at ?? row?.created_at ?? null : row?.revoked_at ?? row?.created_at ?? null;
        const Icon = item.Icon;
        return (
          <div key={item.type}>
            {idx > 0 && <Separator className="my-3" />}
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
                  <label className="text-xs sm:text-sm font-medium text-foreground">
                    {item.label}
                  </label>
                  <Badge
                    variant="outline"
                    className="text-[9px] sm:text-[10px] font-mono px-1.5 py-0 h-4 border-primary/30 text-muted-foreground"
                  >
                    v{row?.policy_version ?? POLICY_VERSION}
                  </Badge>
                </div>
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  {item.description}
                </p>
                <p className="text-[10px] text-muted-foreground/70">
                  {row
                    ? `${granted ? "Granted" : "Revoked"} ${fmt(ts)}`
                    : "No decision recorded yet"}
                </p>
              </div>
              <Switch
                checked={granted}
                disabled={pending === item.type}
                onCheckedChange={(checked) => handleToggle(item.type, checked)}
                className="flex-shrink-0 mt-0.5"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ConsentCenter;