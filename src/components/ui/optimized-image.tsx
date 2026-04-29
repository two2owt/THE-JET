import { useState, ImgHTMLAttributes, memo } from "react";
import { cn } from "@/lib/utils";
import { 
  generateSrcSet, 
  generateSizesAttribute, 
  getSupabaseImageUrl,
  isSupabaseStorageUrl,
  ImageSize 
} from "@/lib/image-utils";
import { useIntersectionObserver } from "@/hooks/useIntersectionObserver";

interface OptimizedImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'loading' | 'sizes'> {
  src: string;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
  eager?: boolean;
  responsive?: boolean;
  responsiveSizes?: ImageSize[];
  sizesConfig?: {
    mobile?: string;
    tablet?: string;
    desktop?: string;
  };
  quality?: number;
  /** Use intersection observer for deferred loading (more aggressive than native lazy) */
  deferLoad?: boolean;
  /** Enable blur-up placeholder effect */
  blurUp?: boolean;
  /** Aspect ratio to reserve space and prevent CLS (e.g., "16/9", "1/1", "4/3") */
  aspectRatio?: string;
  /** Fetch priority for LCP optimization ('high' | 'low' | 'auto') */
  fetchPriority?: 'high' | 'low' | 'auto';
}

export const OptimizedImage = memo(({ 
  src, 
  alt, 
  className, 
  fallback,
  eager = false,
  responsive = true,
  responsiveSizes = ['thumbnail', 'small', 'medium', 'large'],
  sizesConfig,
  quality = 80,
  deferLoad = false,
  blurUp = true,
  aspectRatio,
  fetchPriority,
  onError,
  style,
  ...props 
}: OptimizedImageProps) => {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [placeholderLoaded, setPlaceholderLoaded] = useState(false);
  
  // Use intersection observer for deferred loading
  const [ref, isVisible] = useIntersectionObserver<HTMLDivElement>({
    rootMargin: '150px',
    freezeOnceVisible: true,
  });

  const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    setHasError(true);
    onError?.(e);
  };

  const handleLoad = () => {
    setIsLoaded(true);
  };

  if (hasError && fallback) {
    return <>{fallback}</>;
  }

  // Generate responsive attributes for Supabase images
  const isSupabase = isSupabaseStorageUrl(src);
  const optimizedSrc = isSupabase ? getSupabaseImageUrl(src, 640, quality) : src;
  const srcSet = responsive && isSupabase ? generateSrcSet(src, responsiveSizes, quality) : undefined;
  const sizes = responsive && isSupabase ? generateSizesAttribute(sizesConfig) : undefined;
  
  // Low-quality placeholder for blur-up effect (20px width, very low quality)
  const placeholderSrc = isSupabase 
    ? getSupabaseImageUrl(src, 20, 20) 
    : src;

  // Shared image element for blur-up
  const renderImage = (_showBlur: boolean = false) => (
    <>
      {/* Blur placeholder */}
      {blurUp && !isLoaded && (
        <img
          src={placeholderSrc}
          alt=""
          aria-hidden="true"
          className={cn(
            "absolute inset-0 w-full h-full object-cover transition-opacity duration-500",
            "blur-lg scale-105",
            placeholderLoaded ? "opacity-100" : "opacity-0"
          )}
          onLoad={() => setPlaceholderLoaded(true)}
        />
      )}
      {/* Full quality image */}
      <img
        src={optimizedSrc}
        srcSet={srcSet}
        sizes={sizes}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={fetchPriority}
        className={cn(
          "transition-opacity duration-500 w-full h-full object-cover",
          isLoaded ? "opacity-100" : "opacity-0"
        )}
        onError={handleError}
        onLoad={handleLoad}
        {...props}
      />
    </>
  );

  // Shared style for aspect ratio support to prevent CLS
  const containerStyle = aspectRatio ? { aspectRatio, ...style } : style;

  // If deferLoad is enabled, wrap in observer
  if (deferLoad) {
    return (
      <div ref={ref} className={cn("relative overflow-hidden", className)} style={containerStyle}>
        {isVisible ? (
          renderImage(true)
        ) : (
          <div className="absolute inset-0 w-full h-full bg-muted/50" />
        )}
      </div>
    );
  }

  // Standard blur-up with placeholder
  if (blurUp) {
    return (
      <div className={cn("relative overflow-hidden", className)} style={containerStyle}>
        {renderImage(true)}
      </div>
    );
  }

  // Simple image without blur-up
  return (
    <img
      src={optimizedSrc}
      srcSet={srcSet}
      sizes={sizes}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={fetchPriority}
      className={cn(
        "transition-opacity duration-300",
        isLoaded ? "opacity-100" : "opacity-0",
        className
      )}
      style={containerStyle}
      onError={handleError}
      onLoad={handleLoad}
      {...props}
    />
  );
});

OptimizedImage.displayName = 'OptimizedImage';
