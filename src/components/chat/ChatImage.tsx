import { useChatImageSrc } from "@/lib/chat-image";

interface ChatImageProps {
  value: string | null | undefined;
}

/**
 * Renders an image attached to a chat message. Handles both legacy public URLs
 * and new private storage paths (signed on demand).
 */
export function ChatImage({ value }: ChatImageProps) {
  const src = useChatImageSrc(value);
  if (!value) return null;
  return (
    <img
      src={src ?? undefined}
      alt="Shared image"
      loading="lazy"
      style={{
        display: "block",
        maxWidth: "240px",
        maxHeight: "280px",
        width: "100%",
        height: "auto",
        objectFit: "cover",
        borderRadius: "8px",
        marginBottom: "6px",
        backgroundColor: "hsl(var(--muted))",
      }}
    />
  );
}