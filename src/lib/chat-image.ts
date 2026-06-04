import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { thumbnailPathFor } from "@/lib/image-thumbnail";

// In-memory cache so re-renders / scrollback don't re-sign the same path.
const SIGN_TTL_SECONDS = 60 * 60; // 1h
const cache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Resolve a chat image reference to a usable <img src>.
 * - Absolute URLs (legacy public uploads) pass through unchanged.
 * - Storage paths in the private `chat-images` bucket are signed and cached.
 */
export async function resolveChatImageSrc(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;

  const cached = cache.get(value);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.url;

  const { data, error } = await supabase.storage
    .from("chat-images")
    .createSignedUrl(value, SIGN_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    console.error("Failed to sign chat image URL:", error);
    return null;
  }
  cache.set(value, {
    url: data.signedUrl,
    expiresAt: Date.now() + SIGN_TTL_SECONDS * 1000,
  });
  return data.signedUrl;
}

/**
 * Resolve both the thumbnail (low-res, fast) and full image URLs for a chat
 * message value. Thumbnails are best-effort — when none exists we fall back
 * to the full URL so the consumer can still render something.
 */
export async function resolveChatImagePair(
  value: string | null | undefined,
): Promise<{ thumbUrl: string | null; fullUrl: string | null }> {
  if (!value) return { thumbUrl: null, fullUrl: null };
  // Legacy absolute URLs: no separate thumb.
  if (/^https?:\/\//i.test(value)) return { thumbUrl: value, fullUrl: value };
  const [fullUrl, thumbUrl] = await Promise.all([
    resolveChatImageSrc(value),
    resolveChatImageSrc(thumbnailPathFor(value)),
  ]);
  return { thumbUrl: thumbUrl ?? fullUrl, fullUrl };
}

/** React hook returning { thumbUrl, fullUrl } for progressive rendering. */
export function useChatImagePair(value: string | null | undefined): {
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
    resolveChatImagePair(value).then((p) => {
      if (!cancelled) setPair(p);
    });
    return () => {
      cancelled = true;
    };
  }, [value]);
  return pair;
}

/** React hook variant. Returns null while loading or on error. */
export function useChatImageSrc(value: string | null | undefined): string | null {
  const [src, setSrc] = useState<string | null>(() => {
    if (!value) return null;
    if (/^https?:\/\//i.test(value)) return value;
    const cached = cache.get(value);
    return cached && cached.expiresAt > Date.now() + 60_000 ? cached.url : null;
  });
  useEffect(() => {
    let cancelled = false;
    resolveChatImageSrc(value).then((s) => {
      if (!cancelled) setSrc(s);
    });
    return () => {
      cancelled = true;
    };
  }, [value]);
  return src;
}