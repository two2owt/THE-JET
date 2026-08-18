import { useEffect, useRef, useState, RefObject } from "react";

interface UseIntersectionObserverOptions {
  threshold?: number | number[];
  root?: Element | null;
  rootMargin?: string;
  freezeOnceVisible?: boolean;
}

export function useIntersectionObserver<T extends Element = Element>(
  options: UseIntersectionObserverOptions = {},
): [RefObject<T>, boolean] {
  const {
    threshold = 0,
    root = null,
    rootMargin = "100px", // Start loading 100px before visible
    freezeOnceVisible = true,
  } = options;

  const elementRef = useRef<T>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    // If already visible and frozen, skip observer setup
    if (freezeOnceVisible && isVisible) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const isElementVisible = entry.isIntersecting;

        if (isElementVisible) {
          setIsVisible(true);
          if (freezeOnceVisible) {
            observer.disconnect();
          }
        } else if (!freezeOnceVisible) {
          setIsVisible(false);
        }
      },
      { threshold, root, rootMargin },
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [threshold, root, rootMargin, freezeOnceVisible, isVisible]);

  return [elementRef as RefObject<T>, isVisible];
}

// Hook for lazy loading multiple items in a list
export function useLazyList<T>(
  items: T[],
  batchSize: number = 10,
): { visibleItems: T[]; loadMore: () => void; hasMore: boolean } {
  const [visibleCount, setVisibleCount] = useState(batchSize);

  const visibleItems = items.slice(0, visibleCount);
  const hasMore = visibleCount < items.length;

  const loadMore = () => {
    setVisibleCount((prev) => Math.min(prev + batchSize, items.length));
  };

  return { visibleItems, loadMore, hasMore };
}
