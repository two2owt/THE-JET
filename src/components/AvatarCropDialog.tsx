import { useState, useCallback } from "react";
import Cropper, { Area } from "react-easy-crop";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Loader2, ZoomIn, RotateCw } from "lucide-react";

interface AvatarCropDialogProps {
  open: boolean;
  imageSrc: string | null;
  onClose: () => void;
  onCropComplete: (blob: Blob) => Promise<void> | void;
  isProcessing?: boolean;
}

/** Output square size for the cropped avatar (px) */
const OUTPUT_SIZE = 512;

async function getCroppedBlob(imageSrc: string, pixelCrop: Area, rotation = 0): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageSrc;
  });

  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");

  // Handle rotation by drawing onto an intermediate canvas first
  if (rotation !== 0) {
    const rad = (rotation * Math.PI) / 180;
    const sin = Math.abs(Math.sin(rad));
    const cos = Math.abs(Math.cos(rad));
    const bBoxW = image.width * cos + image.height * sin;
    const bBoxH = image.width * sin + image.height * cos;

    const rotCanvas = document.createElement("canvas");
    rotCanvas.width = bBoxW;
    rotCanvas.height = bBoxH;
    const rotCtx = rotCanvas.getContext("2d")!;
    rotCtx.translate(bBoxW / 2, bBoxH / 2);
    rotCtx.rotate(rad);
    rotCtx.drawImage(image, -image.width / 2, -image.height / 2);

    ctx.drawImage(
      rotCanvas,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      OUTPUT_SIZE,
      OUTPUT_SIZE,
    );
  } else {
    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      OUTPUT_SIZE,
      OUTPUT_SIZE,
    );
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Failed to encode image"))),
      "image/jpeg",
      0.9,
    );
  });
}

export const AvatarCropDialog = ({
  open,
  imageSrc,
  onClose,
  onCropComplete,
  isProcessing = false,
}: AvatarCropDialogProps) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const onCropAreaChange = useCallback((_: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleSave = async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    const blob = await getCroppedBlob(imageSrc, croppedAreaPixels, rotation);
    await onCropComplete(blob);
    // reset for next open
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
  };

  const handleClose = () => {
    if (isProcessing) return;
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adjust your avatar</DialogTitle>
          <DialogDescription>
            Drag to reposition, pinch or use the slider to zoom.
          </DialogDescription>
        </DialogHeader>

        <div className="relative w-full aspect-square bg-muted rounded-lg overflow-hidden">
          {imageSrc && (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropAreaChange}
              objectFit="contain"
            />
          )}
        </div>

        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-3">
            <ZoomIn className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <Slider
              value={[zoom]}
              min={1}
              max={3}
              step={0.05}
              onValueChange={(v) => setZoom(v[0])}
              aria-label="Zoom"
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className="w-full"
          >
            <RotateCw className="w-4 h-4 mr-2" />
            Rotate 90°
          </Button>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isProcessing || !croppedAreaPixels}>
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : (
              "Save avatar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};