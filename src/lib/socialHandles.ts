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

interface PlatformConfig {
  label: string;
  /** Hosts we accept a pasted URL from (www. is stripped before matching). */
  hosts: string[];
  /** Path segments that must precede the handle, e.g. LinkedIn's `in/`. */
  pathPrefixes?: string[];
  /** Path segments that are never a profile (posts, reels, search, etc). */
  reservedPaths?: string[];
  /** Characters a valid handle may contain. */
  pattern: RegExp;
  minLength: number;
  maxLength: number;
  urlTemplate: string;
}

const PLATFORMS: Record<SocialPlatform, PlatformConfig> = {
  instagram: {
    label: "Instagram",
    hosts: ["instagram.com", "instagr.am"],
    reservedPaths: ["p", "reel", "reels", "stories", "explore", "tv", "s"],
    pattern: /^[A-Za-z0-9._]+$/,
    minLength: 1,
    maxLength: 30,
    urlTemplate: "https://instagram.com/{handle}",
  },
  twitter: {
    label: "Twitter / X",
    hosts: ["twitter.com", "x.com"],
    reservedPaths: ["i", "home", "search", "hashtag", "intent", "share"],
    pattern: /^[A-Za-z0-9_]+$/,
    minLength: 1,
    maxLength: 15,
    urlTemplate: "https://x.com/{handle}",
  },
  facebook: {
    label: "Facebook",
    hosts: ["facebook.com", "fb.com", "m.facebook.com", "fb.me"],
    reservedPaths: [
      "profile.php",
      "pages",
      "groups",
      "events",
      "watch",
      "sharer",
      "sharer.php",
      "share",
    ],
    pattern: /^[A-Za-z0-9._-]+$/,
    minLength: 3,
    maxLength: 50,
    urlTemplate: "https://facebook.com/{handle}",
  },
  linkedin: {
    label: "LinkedIn",
    hosts: ["linkedin.com"],
    pathPrefixes: ["in", "pub"],
    reservedPaths: ["company", "school", "feed", "jobs", "posts", "showcase"],
    pattern: /^[A-Za-z0-9-]+$/,
    minLength: 3,
    maxLength: 100,
    urlTemplate: "https://linkedin.com/in/{handle}",
  },
  tiktok: {
    label: "TikTok",
    hosts: ["tiktok.com", "vm.tiktok.com"],
    reservedPaths: ["video", "tag", "search", "foryou", "discover", "music"],
    pattern: /^[A-Za-z0-9._]+$/,
    minLength: 2,
    maxLength: 24,
    urlTemplate: "https://tiktok.com/@{handle}",
  },
};

export const SOCIAL_PLATFORMS = Object.keys(PLATFORMS) as SocialPlatform[];

export type SocialParseResult =
  | { status: "empty"; handle: ""; url: "" }
  | { status: "ok"; handle: string; url: string }
  | {
      status: "error";
      handle: "";
      url: "";
      error: string;
      /** Set when the input is a valid link, but for a different platform. */
      detectedPlatform?: SocialPlatform;
    };

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

/** Returns the platform that owns a hostname, if any. */
export function platformForHost(host: string): SocialPlatform | null {
  const normalized = normalizeHost(host);
  for (const platform of SOCIAL_PLATFORMS) {
    if (PLATFORMS[platform].hosts.some((h) => normalizeHost(h) === normalized)) {
      return platform;
    }
  }
  return null;
}

function looksLikeUrl(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) || /^[^\s/@]+\.[a-z]{2,}(\/|$)/i.test(value);
}

function toUrl(value: string): URL | null {
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
}

function validateHandle(
  platform: SocialPlatform,
  raw: string,
): SocialParseResult {
  const config = PLATFORMS[platform];
  const handle = raw
    .trim()
    .replace(/^@+/, "")
    .replace(/\/+$/, "");

  if (!handle) return { status: "empty", handle: "", url: "" };

  if (!config.pattern.test(handle)) {
    return {
      status: "error",
      handle: "",
      url: "",
      error: `Enter a valid ${config.label} handle (letters, numbers${
        platform === "linkedin" ? " and hyphens" : ", dots and underscores"
      }).`,
    };
  }
  if (handle.length < config.minLength || handle.length > config.maxLength) {
    return {
      status: "error",
      handle: "",
      url: "",
      error: `${config.label} handles are ${config.minLength}–${config.maxLength} characters.`,
    };
  }
  if (config.reservedPaths?.includes(handle.toLowerCase())) {
    return {
      status: "error",
      handle: "",
      url: "",
      error: `That's not a ${config.label} profile — paste your profile link or type your @handle.`,
    };
  }

  return {
    status: "ok",
    handle,
    url: config.urlTemplate.replace("{handle}", handle),
  };
}

/**
 * Parses either a pasted profile URL or a typed `@handle` into a normalized
 * handle plus canonical URL. URLs are only accepted from a known host for the
 * requested platform; anything else is rejected rather than silently stored.
 */
export function parseSocialLink(
  platform: SocialPlatform,
  input: string,
): SocialParseResult {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return { status: "empty", handle: "", url: "" };

  const config = PLATFORMS[platform];

  if (looksLikeUrl(trimmed)) {
    const url = toUrl(trimmed);
    if (!url) {
      return {
        status: "error",
        handle: "",
        url: "",
        error: "That link couldn't be read. Paste the full profile URL.",
      };
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return {
        status: "error",
        handle: "",
        url: "",
        error: "Only http(s) links are supported.",
      };
    }

    const owner = platformForHost(url.hostname);
    if (!owner) {
      return {
        status: "error",
        handle: "",
        url: "",
        error: `${url.hostname.replace(/^www\./, "")} isn't a supported ${config.label} address.`,
      };
    }
    if (owner !== platform) {
      return {
        status: "error",
        handle: "",
        url: "",
        error: `That's a ${PLATFORMS[owner].label} link — paste it in the ${PLATFORMS[owner].label} field.`,
        detectedPlatform: owner,
      };
    }

    const segments = url.pathname
      .split("/")
      .map((s) => decodeURIComponent(s).trim())
      .filter(Boolean);

    if (segments.length === 0) {
      return {
        status: "error",
        handle: "",
        url: "",
        error: `That ${config.label} link doesn't include a profile.`,
      };
    }

    let rest = segments;
    if (config.pathPrefixes) {
      const first = rest[0].toLowerCase();
      if (config.pathPrefixes.includes(first)) {
        rest = rest.slice(1);
      } else if (!first.startsWith("@")) {
        return {
          status: "error",
          handle: "",
          url: "",
          error: `Use your personal ${config.label} profile link (linkedin.com/in/your-name).`,
        };
      }
    }

    if (rest.length === 0) {
      return {
        status: "error",
        handle: "",
        url: "",
        error: `That ${config.label} link doesn't include a profile.`,
      };
    }

    return validateHandle(platform, rest[0]);
  }

  // Not a URL — treat as a typed handle.
  if (/[\s/]/.test(trimmed)) {
    return {
      status: "error",
      handle: "",
      url: "",
      error: `Enter a single ${config.label} handle or paste your profile link.`,
    };
  }

  return validateHandle(platform, trimmed);
}

/**
 * Back-compat wrapper: returns the normalized handle/url, or empty strings when
 * the input can't be normalized. Prefer `parseSocialLink` when you need the
 * error message.
 */
export function parseSocialInput(
  platform: SocialPlatform,
  input: string,
): { handle: string; url: string } {
  const result = parseSocialLink(platform, input);
  return result.status === "ok"
    ? { handle: result.handle, url: result.url }
    : { handle: "", url: "" };
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
  return PLATFORMS[platform].label;
}

export function socialProfileUrl(
  platform: SocialPlatform,
  handle: string,
): string {
  return PLATFORMS[platform].urlTemplate.replace("{handle}", handle);
}
