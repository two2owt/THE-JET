import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Resolve a chat image reference (either a legacy public URL or a storage path)
 * to a usable image src. New uploads store the storage path; old messages may
 * still contain the public URL from when the bucket was public.
 */
export async function resolveChatImageSrc(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  // If it's already an absolute URL, return as-is (legacy messages)
  if (/^https?:\/\//i.test(value)) return value;
  // Otherwise treat as a storage path inside the private chat-images bucket
  const { data, error } = await supabase.storage
    .from("chat-images")
    .createSignedUrl(value, 60 * 60); // 1 hour
  if (error || !data?.signedUrl) {
    console.error("Failed to sign chat image URL:", error);
    return null;
  }
  return data.signedUrl;
}

/** React hook variant. Returns null while loading or on error. */
export function useChatImageSrc(value: string | null | undefined): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    resolveChatImageSrc(value).then((s) => {
      if (!cancelled) setSrc(s);
    });
    return () => {
      cancelled = true;
    };
  }, [value]);
  return src;
}