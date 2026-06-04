import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { thumbnailPathFor } from "@/lib/image-thumbnail";

// In-memory cache so re-renders / scrollback don't re-sign the same path.
const SIGN_TTL_SECONDS = 60 * 60; // 1h
const cache = new Map<string, { url: string; expiresAt: number }>();

function cacheKey(path: string, bust?: string | null): string {
  return bust ? `${path}::${bust}` : path;
}

function applyBust(url: string, bust?: string | null): string {
  if (!bust) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}_cb=${encodeURIComponent(bust)}`;
}

/**
 * Resolve a chat image reference to a usable <img src>.
 * - Absolute URLs (legacy public uploads) pass through unchanged.
 * - Storage paths in the private `chat-images` bucket are signed and cached.
 *
 * `cacheBust` is an optional token (e.g. message created_at or a timestamp)
 * that forces a fresh signed URL when the underlying file may have changed.
 */
export async function resolveChatImageSrc(
  value: string | null | undefined,
  cacheBust?: string | null,
): Promise<string | null> {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;

  const key = cacheKey(value, cacheBust);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.url;

  const { data, error } = await supabase.storage
    .from("chat-images")
    .createSignedUrl(value, SIGN_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    console.error("Failed to sign chat image URL:", error);
    return null;
  }
  const url = applyBust(data.signedUrl, cacheBust);
  cache.set(key, {
    url,
    expiresAt: Date.now() + SIGN_TTL_SECONDS * 1000,
  });
  return url;
}

/**
 * Resolve both the thumbnail (low-res, fast) and full image URLs for a chat
 * message value. Thumbnails are best-effort — when none exists we fall back
 * to the full URL so the consumer can still render something.
 */
export async function resolveChatImagePair(
  value: string | null | undefined,
  cacheBust?: string | null,
): Promise<{ thumbUrl: string | null; fullUrl: string | null }> {
  if (!value) return { thumbUrl: null, fullUrl: null };
  // Legacy absolute URLs: no separate thumb.
  if (/^https?:\/\//i.test(value)) return { thumbUrl: value, fullUrl: value };
  const [fullUrl, thumbUrl] = await Promise.all([
    resolveChatImageSrc(value, cacheBust),
    resolveChatImageSrc(thumbnailPathFor(value), cacheBust),
  ]);
  return { thumbUrl: thumbUrl ?? fullUrl, fullUrl };
}

/** React hook returning { thumbUrl, fullUrl } for progressive rendering. */
export function useChatImagePair(
  value: string | null | undefined,
  cacheBust?: string | null,
): {
  thumbUrl: string | null;
  fullUrl: string | null;
} {
  const [pair, setPair] = useState<{ thumbUrl: string | null; fullUrl: string | null }>({
    thumbUrl: null,
    fullUrl: null,
  });
  useEffect(() => {
    let cancelled = false;
    setPair({ thumbUrl: null, fullUrl: null });
    resolveChatImagePair(value, cacheBust).then((p) => {
      if (!cancelled) setPair(p);
    });
    return () => {
      cancelled = true;
    };
  }, [value, cacheBust]);
  return pair;
}

/** React hook variant. Returns null while loading or on error. */
export function useChatImageSrc(
  value: string | null | undefined,
  cacheBust?: string | null,
): string | null {
  const key = value ? cacheKey(value, cacheBust) : "";
  const [src, setSrc] = useState<string | null>(() => {
    if (!value) return null;
    if (/^https?:\/\//i.test(value)) return value;
    const cached = cache.get(key);
    return cached && cached.expiresAt > Date.now() + 60_000 ? cached.url : null;
  });
  useEffect(() => {
    let cancelled = false;
    resolveChatImageSrc(value, cacheBust).then((s) => {
      if (!cancelled) setSrc(s);
    });
    return () => {
      cancelled = true;
    };
  }, [value, cacheBust]);
  return src;
}