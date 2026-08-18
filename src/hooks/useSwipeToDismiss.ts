import { useState, useRef, useCallback } from "react";
import { glideHaptic } from "@/lib/haptics";

interface UseSwipeToDismissOptions {
  onDismiss: () => void;
  threshold?: number; // Distance in pixels to trigger dismiss
  direction?: "down" | "up" | "left" | "right";
}

export const useSwipeToDismiss = ({
  onDismiss,
  threshold = 100,
  direction = "down",
}: UseSwipeToDismissOptions) => {
  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef(0);
  const startX = useRef(0);
  const currentOffset = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    startX.current = e.touches[0].clientX;
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging) return;

      const currentY = e.touches[0].clientY;
      const currentX = e.touches[0].clientX;

      let delta = 0;

      if (direction === "down") {
        delta = Math.max(0, currentY - startY.current);
      } else if (direction === "up") {
        delta = Math.max(0, startY.current - currentY);
      } else if (direction === "left") {
        delta = Math.max(0, startX.current - currentX);
      } else if (direction === "right") {
        delta = Math.max(0, currentX - startX.current);
      }

      currentOffset.current = delta;
      setOffset(delta);
    },
    [isDragging, direction],
  );

  const handleTouchEnd = useCallback(async () => {
    setIsDragging(false);

    if (currentOffset.current >= threshold) {
      await glideHaptic();
      onDismiss();
    }

    setOffset(0);
    currentOffset.current = 0;
  }, [threshold, onDismiss]);

  const getTransformStyle = useCallback(() => {
    if (offset === 0) return {};

    const opacity = Math.max(0, 1 - offset / (threshold * 1.5));
    const scale = Math.max(0.95, 1 - offset / (threshold * 10));

    let transform = "";
    if (direction === "down") {
      transform = `translateY(${offset}px) scale(${scale})`;
    } else if (direction === "up") {
      transform = `translateY(-${offset}px) scale(${scale})`;
    } else if (direction === "left") {
      transform = `translateX(-${offset}px) scale(${scale})`;
    } else if (direction === "right") {
      transform = `translateX(${offset}px) scale(${scale})`;
    }

    return {
      transform,
      opacity,
      transition: isDragging ? "none" : "all 0.3s ease-out",
    };
  }, [offset, threshold, direction, isDragging]);

  return {
    offset,
    isDragging,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
    style: getTransformStyle(),
  };
};
