const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export type ImageSize = "thumbnail" | "small" | "medium" | "large" | "original";

export const IMAGE_SIZES = {
  thumbnail: 150,
  small: 300,
  medium: 640,
  large: 1024,
  original: null,
} as const;

/**
 * Check if URL is from Supabase Storage
 */
export const isSupabaseStorageUrl = (url: string): boolean => {
  if (!url) return false;
  return url.includes(SUPABASE_URL) && url.includes("/storage/v1/object/");
};

/**
 * Generate Supabase image transformation URL
 */
export const getSupabaseImageUrl = (
  url: string,
  width?: number,
  quality: number = 80,
): string => {
  if (!isSupabaseStorageUrl(url)) return url;

  const urlObj = new URL(url);
  const params = new URLSearchParams(urlObj.search);

  if (width) {
    params.set("width", width.toString());
  }
  params.set("quality", quality.toString());
  params.set("format", "webp"); // Force WebP for better compression

  urlObj.search = params.toString();
  return urlObj.toString();
};

/**
 * Generate srcset string for responsive images
 */
export const generateSrcSet = (
  url: string,
  sizes: ImageSize[] = ["thumbnail", "small", "medium", "large"],
  quality: number = 80,
): string => {
  if (!isSupabaseStorageUrl(url)) return "";

  return sizes
    .map((size) => {
      const width = IMAGE_SIZES[size];
      if (!width) return `${url} ${width}w`;

      const transformedUrl = getSupabaseImageUrl(url, width, quality);
      return `${transformedUrl} ${width}w`;
    })
    .filter(Boolean)
    .join(", ");
};

/**
 * Generate sizes attribute based on breakpoints
 */
export const generateSizesAttribute = (config?: {
  mobile?: string;
  tablet?: string;
  desktop?: string;
}): string => {
  const defaults = {
    mobile: "100vw",
    tablet: "50vw",
    desktop: "33vw",
  };

  const sizes = { ...defaults, ...config };

  return [
    `(max-width: 640px) ${sizes.mobile}`,
    `(max-width: 1024px) ${sizes.tablet}`,
    sizes.desktop,
  ].join(", ");
};

/**
 * Optimize external image URL (non-Supabase)
 * For external URLs, we just append format hints
 */
export const optimizeExternalImageUrl = (url: string): string => {
  if (isSupabaseStorageUrl(url)) return url;

  // For external URLs, just return as-is
  // In production, you might want to use a CDN or image proxy
  return url;
};
