import { useRef, ReactNode, useEffect, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";

interface VirtualListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  estimateSize: number;
  className?: string;
  overscan?: number;
  gap?: number;
  /** Minimum items before enabling virtualization */
  minItemsForVirtualization?: number;
  /** Key extractor for stable keys */
  getItemKey?: (item: T, index: number) => string | number;
}

export function VirtualList<T>({
  items,
  renderItem,
  estimateSize,
  className,
  overscan = 5,
  gap = 12,
  minItemsForVirtualization = 10,
  getItemKey,
}: VirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize + gap,
    overscan,
    getItemKey: getItemKey 
      ? (index) => getItemKey(items[index], index)
      : undefined,
  });

  const virtualItems = virtualizer.getVirtualItems();

  // Don't use virtualization for small lists
  if (items.length < minItemsForVirtualization) {
    return (
      <div className={cn("space-y-3", className)}>
        {items.map((item, index) => (
          <div key={getItemKey ? getItemKey(item, index) : index}>
            {renderItem(item, index)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className={cn("overflow-auto scrollbar-thin", className)}
      style={{ height: "100%", contain: "strict" }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualItems.map((virtualItem) => {
          const item = items[virtualItem.index];
          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualItem.size - gap}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              {renderItem(item, virtualItem.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Virtual grid for card layouts
interface VirtualGridProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  estimateSize: number;
  className?: string;
  overscan?: number;
  gap?: number;
  columns?: { mobile: number; tablet: number; desktop: number };
  getItemKey?: (item: T, index: number) => string | number;
}

export function VirtualGrid<T>({
  items,
  renderItem,
  estimateSize,
  className,
  overscan = 3,
  gap = 16,
  columns = { mobile: 1, tablet: 2, desktop: 3 },
  getItemKey,
}: VirtualGridProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(columns.mobile);

  // Responsive column count
  useEffect(() => {
    const updateColumns = () => {
      const width = window.innerWidth;
      if (width >= 1024) {
        setColumnCount(columns.desktop);
      } else if (width >= 768) {
        setColumnCount(columns.tablet);
      } else {
        setColumnCount(columns.mobile);
      }
    };

    updateColumns();
    window.addEventListener("resize", updateColumns);
    return () => window.removeEventListener("resize", updateColumns);
  }, [columns]);

  const rowCount = Math.ceil(items.length / columnCount);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize + gap,
    overscan,
  });

  const virtualRows = virtualizer.getVirtualItems();

  // Don't virtualize small grids
  if (items.length < 12) {
    return (
      <div
        className={cn(
          "grid gap-4",
          `grid-cols-${columns.mobile} md:grid-cols-${columns.tablet} lg:grid-cols-${columns.desktop}`,
          className
        )}
        style={{ gap }}
      >
        {items.map((item, index) => (
          <div key={getItemKey ? getItemKey(item, index) : index}>
            {renderItem(item, index)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className={cn("overflow-auto scrollbar-thin", className)}
      style={{ height: "100%", contain: "strict" }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualRows.map((virtualRow) => {
          const startIndex = virtualRow.index * columnCount;
          const rowItems = items.slice(startIndex, startIndex + columnCount);

          return (
            <div
              key={virtualRow.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualRow.size - gap}px`,
                transform: `translateY(${virtualRow.start}px)`,
                display: "grid",
                gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
                gap: `${gap}px`,
              }}
            >
              {rowItems.map((item, colIndex) => {
                const itemIndex = startIndex + colIndex;
                return (
                  <div key={getItemKey ? getItemKey(item, itemIndex) : itemIndex}>
                    {renderItem(item, itemIndex)}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
