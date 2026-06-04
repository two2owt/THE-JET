/**
 * Browser-side image downscaling for chat thumbnails.
 * Produces a small JPEG (~320px max edge) that loads instantly while the
 * full-resolution upload completes / downloads.
 */

const THUMB_MAX_EDGE = 320;
const THUMB_QUALITY = 0.7;

export interface ThumbnailResult {
  blob: Blob;
  width: number;
  height: number;
}

export async function generateThumbnail(
  file: File,
  maxEdge = THUMB_MAX_EDGE,
  quality = THUMB_QUALITY,
): Promise<ThumbnailResult | null> {
  try {
    const bitmap = await createBitmapFromFile(file);
    const { width: w, height: h } = bitmap;
    const scale = Math.min(1, maxEdge / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));

    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(tw, th)
        : Object.assign(document.createElement("canvas"), { width: tw, height: th });
    const ctx = canvas.getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx) return null;
    ctx.drawImage(bitmap as unknown as CanvasImageSource, 0, 0, tw, th);
    if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();

    const blob = await canvasToBlob(canvas, "image/jpeg", quality);
    if (!blob) return null;
    return { blob, width: tw, height: th };
  } catch (err) {
    console.warn("Thumbnail generation failed:", err);
    return null;
  }
}

async function createBitmapFromFile(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    return await createImageBitmap(file);
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  type: string,
  quality: number,
): Promise<Blob | null> {
  if ("convertToBlob" in canvas) {
    return (canvas as OffscreenCanvas).convertToBlob({ type, quality });
  }
  return new Promise((resolve) =>
    (canvas as HTMLCanvasElement).toBlob((b) => resolve(b), type, quality),
  );
}

/**
 * Convention: `foo/bar/123_pic.jpg` → `foo/bar/123_pic.thumb.jpg`.
 * Works for any extension; falls back to appending `.thumb` when none.
 */
export function thumbnailPathFor(originalPath: string): string {
  const slash = originalPath.lastIndexOf("/");
  const dir = slash >= 0 ? originalPath.slice(0, slash + 1) : "";
  const file = slash >= 0 ? originalPath.slice(slash + 1) : originalPath;
  const dot = file.lastIndexOf(".");
  if (dot <= 0) return `${dir}${file}.thumb`;
  return `${dir}${file.slice(0, dot)}.thumb${file.slice(dot)}`;
}