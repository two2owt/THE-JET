import { useState, useRef, useCallback } from "react";
import { glideHaptic } from "@/lib/haptics";

interface UseMultiDirectionSwipeOptions {
  onDismiss: () => void;
  threshold?: number;
}

export const useMultiDirectionSwipe = ({
  onDismiss,
  threshold = 80,
}: UseMultiDirectionSwipeOptions) => {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const startPos = useRef({ x: 0, y: 0 });
  const currentOffset = useRef({ x: 0, y: 0 });

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startPos.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging) return;

      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;

      const deltaX = currentX - startPos.current.x;
      const deltaY = Math.max(0, currentY - startPos.current.y); // Only allow downward swipe for Y

      currentOffset.current = { x: deltaX, y: deltaY };
      setOffset({ x: deltaX, y: deltaY });
    },
    [isDragging],
  );

  const handleTouchEnd = useCallback(async () => {
    setIsDragging(false);

    const absX = Math.abs(currentOffset.current.x);
    const absY = currentOffset.current.y;

    if (absX >= threshold || absY >= threshold) {
      await glideHaptic();
      onDismiss();
    }

    setOffset({ x: 0, y: 0 });
    currentOffset.current = { x: 0, y: 0 };
  }, [threshold, onDismiss]);

  const getTransformStyle = useCallback(() => {
    if (offset.x === 0 && offset.y === 0) return {};

    const maxOffset = Math.max(Math.abs(offset.x), offset.y);
    const opacity = Math.max(0, 1 - maxOffset / (threshold * 1.5));
    const scale = Math.max(0.95, 1 - maxOffset / (threshold * 10));

    return {
      transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
      opacity,
      transition: isDragging ? "none" : "all 0.3s ease-out",
    };
  }, [offset, threshold, isDragging]);

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
