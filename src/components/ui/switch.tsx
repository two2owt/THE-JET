import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
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
      border: '2px solid transparent',
      transition: 'background-color 150ms ease',
    }}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0",
      )}
      style={{
        pointerEvents: 'none',
        display: 'block',
        height: '20px',
        width: '20px',
        borderRadius: '9999px',
        background: 'hsl(var(--background))',
        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
        transition: 'transform 150ms ease',
      }}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
