import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Target = "all" | "user" | "neighborhood";

interface Neighborhood { id: string; name: string }

export function TestPushPanel() {
  const [target, setTarget] = useState<Target>("all");
  const [userId, setUserId] = useState("");
  const [neighborhoodId, setNeighborhoodId] = useState("");
  const [title, setTitle] = useState("JET test push");
  const [body, setBody] = useState("If you're seeing this, web push is working end-to-end. 🚀");
  const [url, setUrl] = useState("/");
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("neighborhoods")
        .select("id, name")
        .order("name", { ascending: true });
      if (!cancelled && !error && data) setNeighborhoods(data as Neighborhood[]);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      toast.error("Title and body are required");
      return;
    }
    if (target === "user" && !userId.trim()) {
      toast.error("Enter a user ID");
      return;
    }
    if (target === "neighborhood" && !neighborhoodId) {
      toast.error("Pick a neighborhood");
      return;
    }

    setSending(true);
    try {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        body: body.trim(),
        data: { url: url.trim() || "/" },
      };
      if (target === "user") payload.user_ids = [userId.trim()];
      if (target === "neighborhood") payload.neighborhood_id = neighborhoodId;

      const { data, error } = await supabase.functions.invoke("send-web-push", { body: payload });
      if (error) throw error;

      const sent = (data as { sent?: number; total?: number; errors?: number } | null)?.sent ?? 0;
      const total = (data as { sent?: number; total?: number } | null)?.total ?? 0;
      const errors = (data as { errors?: number } | null)?.errors ?? 0;
      toast.success(`Sent ${sent}/${total} push notifications${errors ? ` · ${errors} failed` : ""}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send push";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xl p-5 sm:p-6 flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-display font-semibold">Send test push</h2>
        <p className="text-sm text-muted-foreground">Manually deliver a web push to verify end-to-end delivery.</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Audience</Label>
        <RadioGroup
          value={target}
          onValueChange={(v) => setTarget(v as Target)}
          className="grid grid-cols-1 sm:grid-cols-3 gap-2"
        >
          {(["all", "user", "neighborhood"] as Target[]).map((t) => (
            <label
              key={t}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 cursor-pointer transition-colors ${
                target === t ? "border-primary bg-primary/10" : "border-border/60 hover:bg-muted/40"
              }`}
            >
              <RadioGroupItem value={t} />
              <span className="text-sm capitalize">{t === "all" ? "All subscribers" : t}</span>
            </label>
          ))}
        </RadioGroup>
      </div>

      {target === "user" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="test-push-user-id">User ID (UUID)</Label>
          <Input
            id="test-push-user-id"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
          />
        </div>
      )}

      {target === "neighborhood" && (
        <div className="flex flex-col gap-2">
          <Label>Neighborhood</Label>
          <Select value={neighborhoodId} onValueChange={setNeighborhoodId}>
            <SelectTrigger><SelectValue placeholder="Pick a neighborhood" /></SelectTrigger>
            <SelectContent>
              {neighborhoods.map((n) => (
                <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="test-push-title">Title</Label>
          <Input id="test-push-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="test-push-url">Click URL</Label>
          <Input id="test-push-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="/" />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="test-push-body">Body</Label>
        <Textarea id="test-push-body" rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSend} disabled={sending} className="gap-2">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {sending ? "Sending…" : "Send test push"}
        </Button>
      </div>
    </div>
  );
}