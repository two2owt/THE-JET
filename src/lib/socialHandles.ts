export type SocialPlatform =
  | "instagram"
  | "twitter"
  | "facebook"
  | "linkedin"
  | "tiktok";

export interface SocialHandle {
  platform: SocialPlatform;
  handle: string;
  url: string | null;
}

const PLATFORM_PATTERNS: Record<
  SocialPlatform,
  { domains: string[]; pathPrefix?: string; urlTemplate: string }
> = {
  instagram: {
    domains: ["instagram.com", "www.instagram.com"],
    urlTemplate: "https://instagram.com/{handle}",
  },
  twitter: {
    domains: ["twitter.com", "www.twitter.com", "x.com", "www.x.com"],
    urlTemplate: "https://x.com/{handle}",
  },
  facebook: {
    domains: ["facebook.com", "www.facebook.com", "fb.com", "www.fb.com"],
    urlTemplate: "https://facebook.com/{handle}",
  },
  linkedin: {
    domains: ["linkedin.com", "www.linkedin.com"],
    pathPrefix: "in/",
    urlTemplate: "https://linkedin.com/in/{handle}",
  },
  tiktok: {
    domains: ["tiktok.com", "www.tiktok.com"],
    urlTemplate: "https://tiktok.com/@{handle}",
  },
};

/**
 * Accepts either a bare handle (e.g. "jetaround") or a full URL and returns
 * a normalized handle + canonical platform URL. Keeps the original URL as a
 * fallback when parsing fails so users don't lose what they typed.
 */
export function parseSocialInput(
  platform: SocialPlatform,
  input: string,
): { handle: string; url: string } {
  const trimmed = input.trim();
  if (!trimmed) return { handle: "", url: "" };

  const config = PLATFORM_PATTERNS[platform];
  const bare = trimmed.replace(/^@/, "");

  // If it looks like a URL, try to extract the handle.
  try {
    const url = new URL(
      trimmed.startsWith("http") ? trimmed : `https://${trimmed}`,
    );
    const hostname = url.hostname.replace(/^www\./, "");
    const isKnownDomain = config.domains.some(
      (d) => hostname === d.replace(/^www\./, ""),
    );
    if (isKnownDomain) {
      let path = url.pathname.replace(/^\/+/, "");
      if (config.pathPrefix && path.startsWith(config.pathPrefix)) {
        path = path.slice(config.pathPrefix.length);
      }
      const handle = path.split("/")[0].split("?")[0].split("#")[0];
      if (handle) {
        return {
          handle: cleanHandle(handle),
          url: config.urlTemplate.replace("{handle}", cleanHandle(handle)),
        };
      }
    }
  } catch {
    // Not a parseable URL — treat input as a bare handle.
  }

  // Bare handle path.
  return {
    handle: cleanHandle(bare),
    url: config.urlTemplate.replace("{handle}", cleanHandle(bare)),
  };
}

function cleanHandle(handle: string): string {
  return handle
    .trim()
    .replace(/^@+/, "")
    .replace(/\?.*$/, "")
    .replace(/#.*$/, "");
}

/**
 * Builds a display label like "@jetaround" when we have a handle, otherwise
 * falls back to the platform name.
 */
export function socialDisplayLabel(platform: SocialPlatform, handle?: string) {
  if (!handle) return platformLabel(platform);
  return `@${handle}`;
}

export function platformLabel(platform: SocialPlatform): string {
  switch (platform) {
    case "instagram":
      return "Instagram";
    case "twitter":
      return "Twitter / X";
    case "facebook":
      return "Facebook";
    case "linkedin":
      return "LinkedIn";
    case "tiktok":
      return "TikTok";
  }
}
