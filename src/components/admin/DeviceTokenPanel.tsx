import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deactivateDeviceToken,
  listMyDeviceTokens,
  registerDeviceToken,
} from "@/lib/device-tokens.functions";

type TokenRow = Awaited<ReturnType<typeof listMyDeviceTokens>>[number];

/**
 * Register an APNs/FCM device token against the signed-in account so native
 * push can be exercised end-to-end without touching the database by hand.
 */
export function DeviceTokenPanel() {
  const [token, setToken] = useState("");
  const [platform, setPlatform] = useState<"ios" | "android">("ios");
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listMyDeviceTokens());
    } catch {
      /* surfaced on write paths */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleRegister = async () => {
    const value = token.trim();
    if (value.length < 16) {
      toast.error("Paste the full device token from the native shell");
      return;
    }
    setSaving(true);
    try {
      const result = await registerDeviceToken({
        data: { token: value, platform },
      });
      toast.success(
        result.created ? "Device token registered" : "Device token refreshed",
        { description: `${result.platform} · ${result.token}` },
      );
      setToken("");
      await refresh();
    } catch (err) {
      toast.error("Could not register token", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (endpoint: string) => {
    // Masked rows can't be deactivated by value — use the visible input.
    setToken("");
    try {
      await deactivateDeviceToken({ data: { token: endpoint } });
      toast.success("Token deactivated");
      await refresh();
    } catch (err) {
      toast.error("Could not deactivate token", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-5 backdrop-blur">
      <div className="mb-4 flex items-center gap-2">
        <Smartphone className="h-4 w-4 text-primary" />
        <h3 className="font-display text-base font-semibold">
          Native device tokens
        </h3>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Paste an APNs or FCM token logged by the iOS/Android shell to register
        it against your account, then send a test push above.
      </p>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="device-token">Device token</Label>
          <Input
            id="device-token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="fA1b2C3…"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <RadioGroup
          value={platform}
          onValueChange={(v) => setPlatform(v as "ios" | "android")}
          className="flex gap-6"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="ios" id="platform-ios" />
            <Label htmlFor="platform-ios">iOS</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="android" id="platform-android" />
            <Label htmlFor="platform-android">Android</Label>
          </div>
        </RadioGroup>

        <Button onClick={handleRegister} disabled={saving} className="w-full">
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Smartphone className="mr-2 h-4 w-4" />
          )}
          Register device token
        </Button>
      </div>

      <div className="mt-6">
        <h4 className="mb-2 text-sm font-medium">Registered on this account</h4>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No native tokens registered yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-3 py-2 text-sm"
              >
                <span className="truncate">
                  <span className="font-mono">{row.endpoint}</span>
                  <span className="ml-2 text-muted-foreground">
                    {row.platform} · {row.active ? "active" : "inactive"}
                  </span>
                </span>
                {row.active && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Deactivate token"
                    onClick={() => handleDeactivate(row.endpoint)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
