import { useState } from "react";
import { useChatImagePair } from "@/lib/chat-image";

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
  const { thumbUrl, fullUrl } = useChatImagePair(value);
  const [fullLoaded, setFullLoaded] = useState(false);
  if (!value) return null;

  const showFull = !!fullUrl && fullLoaded;
  const placeholderSrc = thumbUrl ?? fullUrl ?? undefined;

  const baseStyle: React.CSSProperties = {
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
        backgroundColor: "hsl(var(--muted))",
  };

  return (
    <div
      style={{
        position: "relative",
        display: "inline-block",
        marginBottom: "6px",
        borderRadius: "12px",
        overflow: "hidden",
        backgroundColor: "hsl(var(--muted))",
      }}
    >
      {/* Low-res placeholder — blurred until the full image loads in */}
      {placeholderSrc && (
        <img
          src={placeholderSrc}
          alt=""
          aria-hidden="true"
          draggable={false}
          decoding="async"
          style={{
            ...baseStyle,
            filter: showFull ? "none" : "blur(8px)",
            transform: showFull ? "none" : "scale(1.04)", // hide blur edges
            transition: "filter 200ms ease-out",
            marginBottom: 0,
          }}
        />
      )}
      {/* Full-resolution image — fades in on top once loaded */}
      {fullUrl && (
        <img
          src={fullUrl}
          alt="Shared image"
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setFullLoaded(true)}
          style={{
            ...baseStyle,
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            opacity: showFull ? 1 : 0,
            transition: "opacity 200ms ease-out",
            marginBottom: 0,
          }}
        />
      )}
    </div>
  );
}