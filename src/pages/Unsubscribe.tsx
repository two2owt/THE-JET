import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Loader2, MailX, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type Status = "validating" | "ready" | "already" | "invalid" | "submitting" | "done" | "error";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [status, setStatus] = useState<Status>("validating");
  const [email, setEmail] = useState<string>("");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      setMessage("Missing unsubscribe token.");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`,
          { headers: { apikey: SUPABASE_KEY } },
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setStatus("invalid");
          setMessage(data?.error || "This unsubscribe link is invalid or expired.");
          return;
        }
        if (data?.alreadyUnsubscribed || data?.used) {
          setStatus("already");
          if (data?.email) setEmail(data.email);
          return;
        }
        if (data?.email) setEmail(data.email);
        setStatus("ready");
      } catch {
        if (!cancelled) {
          setStatus("error");
          setMessage("Something went wrong validating your link.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleConfirm = async () => {
    setStatus("submitting");
    try {
      const { data, error } = await supabase.functions.invoke(
        "handle-email-unsubscribe",
        { body: { token } },
      );
      if (error) throw error;
      if ((data as any)?.email) setEmail((data as any).email);
      setStatus("done");
    } catch (e: any) {
      setStatus("error");
      setMessage(e?.message || "We couldn't process your unsubscribe. Please try again.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 sm:px-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center ring-2 ring-primary/30 shadow-glow">
            {status === "done" || status === "already" ? (
              <CheckCircle2 className="w-12 h-12 text-primary" />
            ) : status === "invalid" || status === "error" ? (
              <AlertCircle className="w-12 h-12 text-destructive" />
            ) : (
              <MailX className="w-12 h-12 text-primary" />
            )}
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-extrabold bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent">
            {status === "done" || status === "already"
              ? "You're unsubscribed"
              : status === "invalid" || status === "error"
                ? "Link issue"
                : "Unsubscribe from JET emails"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {status === "validating" && "Checking your link…"}
            {status === "ready" &&
              (email
                ? `Stop sending non-essential emails to ${email}?`
                : "Confirm to stop receiving non-essential emails from JET.")}
            {status === "submitting" && "Updating your preferences…"}
            {status === "done" &&
              (email
                ? `${email} will no longer receive marketing or update emails. Account-critical emails (like password resets) will still be delivered.`
                : "You will no longer receive marketing or update emails.")}
            {status === "already" &&
              (email
                ? `${email} is already unsubscribed.`
                : "This address is already unsubscribed.")}
            {(status === "invalid" || status === "error") && (message || "Please try again.")}
          </p>
        </div>

        {status === "ready" && (
          <Button
            type="button"
            onClick={handleConfirm}
            variant="jet"
            size="lg"
            className="w-full"
          >
            Confirm unsubscribe
          </Button>
        )}
        {status === "submitting" && (
          <Button disabled variant="jet" size="lg" className="w-full">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Processing…
          </Button>
        )}
        {status === "validating" && (
          <div className="flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}
      </div>
    </div>
  );
}