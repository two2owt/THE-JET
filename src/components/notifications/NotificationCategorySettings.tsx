import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  Heart,
  Loader2,
  Megaphone,
  MoonStar,
  Tag,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";

/** Categories the dispatch worker checks before fanning a push out. */
export const NOTIFICATION_CATEGORIES = [
  {
    key: "deals",
    label: "Deals & drops",
    description: "New and activated deals from merchants near you.",
    Icon: Tag,
  },
  {
    key: "favorites",
    label: "Favorites",
    description: "Updates for venues and deals you saved.",
    Icon: Heart,
  },
  {
    key: "social",
    label: "Messages & crew",
    description: "Direct messages and connection requests.",
    Icon: Users,
  },
  {
    key: "system",
    label: "Account & system",
    description: "Security, verification and important service notices.",
    Icon: Bell,
  },
  {
    key: "marketing",
    label: "Promos & newsletter",
    description: "Occasional JET news and offers. Off by default.",
    Icon: Megaphone,
  },
] as const;

type CategoryKey = (typeof NOTIFICATION_CATEGORIES)[number]["key"];
type CategoryMap = Record<string, boolean>;

const DEFAULT_CATEGORIES: CategoryMap = {
  deals: true,
  favorites: true,
  social: true,
  system: true,
  marketing: false,
};

const formatHour = (h: number) => {
  const suffix = h < 12 ? "AM" : "PM";
  const hour = h % 12 || 12;
  return `${hour}:00 ${suffix}`;
};

/**
 * Per-type push preferences backed by `user_notification_settings`. Each
 * toggle writes the `categories` JSONB the dispatch worker already reads, so
 * turning a type off stops those pushes server-side (not just on this device).
 */
export function NotificationCategorySettings({
  userId,
  disabled,
}: {
  userId: string | null;
  disabled?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<CategoryMap>(DEFAULT_CATEGORIES);
  const [quietEnabled, setQuietEnabled] = useState(true);
  const [quietRange, setQuietRange] = useState<[number, number]>([22, 8]);

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("user_notification_settings")
      .select("categories, quiet_hours_enabled, quiet_hours_start, quiet_hours_end")
      .eq("user_id", userId)
      .maybeSingle();

    if (data) {
      const raw = (data.categories ?? {}) as CategoryMap;
      setCategories({ ...DEFAULT_CATEGORIES, ...raw });
      setQuietEnabled(data.quiet_hours_enabled !== false);
      setQuietRange([data.quiet_hours_start ?? 22, data.quiet_hours_end ?? 8]);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = async (patch: Record<string, unknown>) => {
    if (!userId) {
      toast.error("Sign in to manage alerts");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("user_notification_settings")
        .upsert(
          {
            user_id: userId,
            timezone:
              Intl.DateTimeFormat().resolvedOptions().timeZone ||
              "America/New_York",
            updated_at: new Date().toISOString(),
            ...patch,
          },
          { onConflict: "user_id" },
        );
      if (error) throw error;
    } catch (err) {
      console.error("[notifications] category save failed", err);
      toast.error("Could not save that preference");
      void load();
    } finally {
      setSaving(false);
    }
  };

  const toggleCategory = (key: CategoryKey, next: boolean) => {
    const updated = { ...categories, [key]: next };
    setCategories(updated);
    void persist({ categories: updated });
  };

  const busy = loading || saving || !!disabled;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">What you get alerted about</p>
          <p className="text-xs text-muted-foreground">
            Applies to every device signed in to your account.
          </p>
        </div>
        {busy && (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        )}
      </div>

      <ul className="space-y-2">
        {NOTIFICATION_CATEGORIES.map(({ key, label, description, Icon }) => (
          <li
            key={key}
            className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 p-3"
          >
            <div className="flex min-w-0 items-start gap-2.5">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
            </div>
            <Switch
              checked={categories[key] !== false}
              onCheckedChange={(next) => toggleCategory(key, next)}
              disabled={busy || !userId}
              aria-label={`Toggle ${label} notifications`}
            />
          </li>
        ))}
      </ul>

      <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <MoonStar className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-sm font-medium">Quiet hours</p>
              <p className="text-xs text-muted-foreground">
                Alerts are held until the window ends instead of waking you.
              </p>
            </div>
          </div>
          <Switch
            checked={quietEnabled}
            onCheckedChange={(next) => {
              setQuietEnabled(next);
              void persist({ quiet_hours_enabled: next });
            }}
            disabled={busy || !userId}
            aria-label="Toggle quiet hours"
          />
        </div>

        {quietEnabled && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>From {formatHour(quietRange[0])}</span>
              <span>To {formatHour(quietRange[1])}</span>
            </div>
            <Slider
              min={0}
              max={23}
              step={1}
              value={quietRange}
              onValueChange={(v) => setQuietRange([v[0], v[1]] as [number, number])}
              onValueCommit={(v) =>
                void persist({
                  quiet_hours_start: v[0],
                  quiet_hours_end: v[1],
                })
              }
              disabled={busy || !userId}
              aria-label="Quiet hours range"
            />
          </div>
        )}
      </div>
    </div>
  );
}
