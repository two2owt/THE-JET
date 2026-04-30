import * as React from "react";
import * as SeparatorPrimitive from "@radix-ui/react-separator";

import { cn } from "@/lib/utils";

const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(({ className, orientation = "horizontal", decorative = true, style, ...props }, ref) => (
  <SeparatorPrimitive.Root
    ref={ref}
    decorative={decorative}
    orientation={orientation}
    className={cn("shrink-0 bg-border", orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]", className)}
    style={{
      flexShrink: 0,
      // Hairline gradient — fades in/out at edges for refinement
      background:
        orientation === "horizontal"
          ? 'linear-gradient(90deg, transparent, hsl(0 0% 100% / 0.08) 50%, transparent)'
          : 'linear-gradient(180deg, transparent, hsl(0 0% 100% / 0.08) 50%, transparent)',
      ...(orientation === "horizontal"
        ? { height: '1px', width: '100%' }
        : { height: '100%', width: '1px' }),
      ...style,
    }}
    {...props}
  />
));
Separator.displayName = SeparatorPrimitive.Root.displayName;

export { Separator };
