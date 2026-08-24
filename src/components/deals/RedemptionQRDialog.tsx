import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, QrCode, RefreshCw } from "lucide-react";
import { toQrPayload } from "@/lib/redemptionCode";
import {
  issueRedemptionCode,
  type IssuedRedemption,
} from "@/lib/redemptions.functions";

interface RedemptionQRDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
  dealTitle: string;
  venueName?: string | null;
}

export function RedemptionQRDialog({
  open,
  onOpenChange,
  dealId,
  dealTitle,
  venueName,
}: RedemptionQRDialogProps) {
  const issue = useServerFn(issueRedemptionCode);
  const [redemption, setRedemption] = useState<IssuedRedemption | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await issue({ data: { dealId } });
      setRedemption(res);
      const QRCode = (await import("qrcode")).default;
      const url = await QRCode.toDataURL(toQrPayload(res.code), {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 512,
        color: { dark: "#0A0A0A", light: "#FFFFFF" },
      });
      setQrDataUrl(url);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not create your redemption code.",
      );
    } finally {
      setLoading(false);
    }
  }, [dealId, issue]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const alreadyRedeemed = redemption?.status === "redeemed";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" />
            Redemption code
          </DialogTitle>
          <DialogDescription>
            Show this to staff at {venueName || "the venue"} to redeem{" "}
            {dealTitle}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          {loading && <Skeleton className="h-56 w-56 rounded-2xl" />}

          {!loading && error && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" onClick={() => void load()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Try again
              </Button>
            </div>
          )}

          {!loading && !error && redemption && qrDataUrl && (
            <>
              <div className="rounded-2xl bg-white p-3 shadow-lg">
                <img
                  src={qrDataUrl}
                  alt={`QR redemption code for ${dealTitle}`}
                  width={224}
                  height={224}
                  className="h-56 w-56"
                />
              </div>

              <p className="font-mono text-lg tracking-widest">
                {redemption.code}
              </p>

              <div className="flex flex-wrap items-center justify-center gap-2">
                {alreadyRedeemed ? (
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Already redeemed
                  </Badge>
                ) : (
                  <Badge variant="default">Ready to scan</Badge>
                )}
                <Badge variant={redemption.dealActive ? "outline" : "secondary"}>
                  {redemption.dealActive ? "Deal active" : "Deal inactive"}
                </Badge>
              </div>

              <p className="text-center text-xs text-muted-foreground">
                {alreadyRedeemed
                  ? "This code has been used. The merchant already logged it."
                  : "Each deal gets one code per member. Redemptions sync to the merchant dashboard instantly."}
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default RedemptionQRDialog;
