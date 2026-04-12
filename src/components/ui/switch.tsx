import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=unchecked]:bg-transparent data-[state=unchecked]:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    style={{
      display: 'inline-flex',
      height: '24px',
      width: '44px',
      flexShrink: 0,
      cursor: 'pointer',
      alignItems: 'center',
      borderRadius: '9999px',
      transition: 'background-color 150ms ease, border-color 150ms ease',
    }}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-5 w-5 rounded-full shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0 data-[state=checked]:bg-primary-foreground data-[state=unchecked]:bg-primary/40",
      )}
      style={{
        pointerEvents: 'none',
        display: 'block',
        height: '20px',
        width: '20px',
        borderRadius: '9999px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        transition: 'transform 150ms ease, background-color 150ms ease',
      }}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
