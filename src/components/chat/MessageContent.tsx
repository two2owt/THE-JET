import { useNavigate } from "react-router";
import { MapPin } from "lucide-react";

interface MessageContentProps {
  content: string;
  isMine: boolean;
}

/**
 * Renders message text with clickable venue/deal deep links.
 * Detects URLs like /?venue=... or /?deal=... and makes them tappable.
 */
export function MessageContent({ content, isMine }: MessageContentProps) {
  const navigate = useNavigate();

  // Match deep link URLs in the message
  const deepLinkRegex = new RegExp(
    `(${window.location.origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/\\?(?:venue|deal)=[^\\s]+)`,
    'g'
  );

  const parts = content.split(deepLinkRegex);

  if (parts.length === 1) {
    // No deep links found, render plain text
    return (
      <p className="text-sm whitespace-pre-wrap break-words">{content}</p>
    );
  }

  return (
    <p className="text-sm whitespace-pre-wrap break-words">
      {parts.map((part, i) => {
        if (deepLinkRegex.test(part)) {
          // Reset regex lastIndex after test
          deepLinkRegex.lastIndex = 0;

          // Extract the path portion
          try {
            const url = new URL(part);
            const venueName = url.searchParams.get("venue");
            const dealId = url.searchParams.get("deal");

            const handleClick = (e: React.MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              // Navigate to the deep link path
              navigate(url.pathname + url.search);
            };

            return (
              <button
                key={i}
                onClick={handleClick}
                className={`inline-flex items-center gap-1 underline underline-offset-2 font-medium rounded-sm transition-opacity hover:opacity-80 ${
                  isMine ? "text-primary-foreground" : "text-primary"
                }`}
              >
                <MapPin className="w-3.5 h-3.5 inline-block flex-shrink-0" />
                {venueName
                  ? `Open ${decodeURIComponent(venueName)} on map`
                  : dealId
                  ? "View deal on map"
                  : "Open link"}
              </button>
            );
          } catch {
            return <span key={i}>{part}</span>;
          }
        }
        // Reset regex lastIndex
        deepLinkRegex.lastIndex = 0;
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}
