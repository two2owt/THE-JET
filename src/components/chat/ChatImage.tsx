import { useChatImageSrc } from "@/lib/chat-image";

interface ChatImageProps {
  value: string | null | undefined;
}

/**
 * Renders an image attached to a chat message. Handles both legacy public URLs
 * and new private storage paths (signed + cached on demand).
 *
 * Adaptive sizing: fluidly scales with the message bubble using clamp() while
 * staying within project-wide chat image constraints (≤240×280). Aspect ratio
 * is preserved and a muted placeholder reserves space to prevent CLS.
 */
export function ChatImage({ value }: ChatImageProps) {
  const src = useChatImageSrc(value);
  if (!value) return null;
  return (
    <img
      src={src ?? undefined}
      alt="Shared image"
      loading="lazy"
      decoding="async"
      draggable={false}
      style={{
        display: "block",
        // Fluid width: min 140, ideal 60% of bubble, max 240 (project rule)
        width: "clamp(140px, 60vw, 240px)",
        maxWidth: "100%",
        maxHeight: "280px",
        height: "auto",
        aspectRatio: "auto",
        objectFit: "cover",
        objectPosition: "center",
        borderRadius: "12px",
        marginBottom: "6px",
        backgroundColor: "hsl(var(--muted))",
      }}
    />
  );
}