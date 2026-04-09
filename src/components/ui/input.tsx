import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, style, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 min-h-[44px] w-full rounded-md border border-input bg-background text-foreground px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm touch-manipulation",
          className,
        )}
        style={{
          display: 'flex',
          height: '44px',
          minHeight: '44px',
          width: '100%',
          borderRadius: '8px',
          border: '1px solid hsl(var(--input))',
          background: 'hsl(var(--background))',
          color: 'hsl(var(--foreground))',
          padding: '8px 12px',
          fontSize: '16px',
          ...style,
        }}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
