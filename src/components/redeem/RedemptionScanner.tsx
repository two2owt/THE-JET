import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertTriangle,
  Camera,
  CameraOff,
  CheckCircle2,
  QrCode,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { parseRedemptionCode } from "@/lib/redemptionCode";
import {
  redeemRedemptionCode,
  type RedeemResult,
} from "@/lib/redemptions.functions";

const STATUS_META: Record<
  RedeemResult["status"],
  { label: string; tone: "ok" | "warn" | "bad"; hint: string }
> = {
  redeemed: {
    label: "Redeemed",
    tone: "ok",
    hint: "Logged and sent to the merchant dashboard.",
  },
  already_redeemed: {
    label: "Already used",
    tone: "warn",
    hint: "This code was redeemed earlier.",
  },
  void: {
    label: "Void",
    tone: "bad",
    hint: "This code was cancelled and cannot be redeemed.",
  },
  not_found: {
    label: "Unknown code",
    tone: "bad",
    hint: "No redemption matches that code.",
  },
};

export function RedemptionScanner() {
  const redeem = useServerFn(redeemRedemptionCode);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const lastCodeRef = useRef<string>("");

  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [result, setResult] = useState<RedeemResult | null>(null);
  const [history, setHistory] = useState<RedeemResult[]>([]);

  const submitCode = useCallback(
    async (raw: string) => {
      const code = parseRedemptionCode(raw);
      if (!code) {
        toast.error("That doesn't look like a JET redemption code.");
        return;
      }
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        const res = await redeem({ data: { code } });
        setResult(res);
        setHistory((prev) => [res, ...prev].slice(0, 10));
        if (res.status === "redeemed") {
          toast.success(`Redeemed — ${res.dealTitle ?? code}`);
          void navigator.vibrate?.(30);
        } else {
          toast.warning(STATUS_META[res.status].label);
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not redeem that code.",
        );
      } finally {
        busyRef.current = false;
      }
    },
    [redeem],
  );

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanning(true);

      const jsQR = (await import("jsqr")).default;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      const tick = () => {
        const video = videoRef.current;
        if (!video || !ctx || !streamRef.current) return;
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const found = jsQR(image.data, image.width, image.height);
          const code = found ? parseRedemptionCode(found.data) : null;
          if (code && code !== lastCodeRef.current) {
            lastCodeRef.current = code;
            void submitCode(code);
            setTimeout(() => {
              lastCodeRef.current = "";
            }, 3000);
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      setCameraError(
        err instanceof Error
          ? err.message
          : "Camera unavailable — enter the code manually.",
      );
      setScanning(false);
    }
  }, [submitCode]);

  useEffect(() => stopCamera, [stopCamera]);

  const meta = result ? STATUS_META[result.status] : null;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <QrCode className="h-4 w-4 text-primary" />
            Scan member QR
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-border bg-muted/40">
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-full w-full object-cover"
            />
            {!scanning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
                <CameraOff className="h-8 w-8 text-muted-foreground" />
                <p className="max-w-[16rem] text-xs text-muted-foreground">
                  {cameraError ?? "Camera is off. Start it to scan a code."}
                </p>
              </div>
            )}
          </div>

          <Button
            className="min-h-11"
            variant={scanning ? "outline" : "default"}
            onClick={() => (scanning ? stopCamera() : void startCamera())}
          >
            <Camera className="mr-2 h-4 w-4" />
            {scanning ? "Stop camera" : "Start camera"}
          </Button>

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void submitCode(manualCode);
              setManualCode("");
            }}
          >
            <Input
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="JET-XXXXX-XXXXX"
              aria-label="Redemption code"
              className="min-h-11 font-mono uppercase"
            />
            <Button type="submit" variant="secondary" className="min-h-11">
              Redeem
            </Button>
          </form>
        </CardContent>
      </Card>

      {result && meta && (
        <Card>
          <CardContent className="flex items-start gap-3 pt-6">
            {meta.tone === "ok" ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />
            ) : meta.tone === "warn" ? (
              <AlertTriangle className="mt-0.5 h-5 w-5 text-muted-foreground" />
            ) : (
              <XCircle className="mt-0.5 h-5 w-5 text-destructive" />
            )}
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{meta.label}</span>
                <Badge variant="outline" className="font-mono text-[11px]">
                  {result.code}
                </Badge>
                {result.status === "redeemed" && !result.dealActive && (
                  <Badge variant="secondary">Inactive deal</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {result.dealTitle ?? "—"}
                {result.venueName ? ` · ${result.venueName}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">{meta.hint}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {history.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">This session</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {history.map((h, i) => (
              <div
                key={`${h.code}-${i}`}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="font-mono">{h.code}</span>
                <span className="text-muted-foreground">
                  {STATUS_META[h.status].label}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default RedemptionScanner;
