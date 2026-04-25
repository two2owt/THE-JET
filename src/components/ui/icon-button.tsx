import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const iconButtonVariants = cva(
  // Base: every descendant SVG is centered, non-shrinkable, block (no baseline gap),
  // and click-through so the parent button always receives the event.
  "inline-flex items-center justify-center rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 touch-manipulation [&_svg]:block [&_svg]:shrink-0 [&_svg]:pointer-events-none",
  {
    variants: {
      variant: {
        default: "bg-transparent text-muted-foreground hover:bg-primary/10 hover:text-primary",
        ghost: "bg-transparent text-muted-foreground hover:bg-accent/10 hover:text-foreground",
        muted: "bg-transparent text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground",
      },
      size: {
        default: "h-11 w-11 min-h-[44px] min-w-[44px] [&_svg]:h-4 [&_svg]:w-4",
        sm: "h-9 w-9 min-h-[36px] min-w-[36px] sm:min-h-[44px] sm:min-w-[44px] [&_svg]:h-3.5 [&_svg]:w-3.5",
        lg: "h-12 w-12 min-h-[48px] min-w-[48px] [&_svg]:h-5 [&_svg]:w-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof iconButtonVariants> {
  asChild?: boolean;
  ariaLabel: string;
  ariaPressed?: boolean;
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant, size, asChild = false, ariaLabel, ariaPressed, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(iconButtonVariants({ variant, size, className }))}
        ref={ref}
        type="button"
        aria-label={ariaLabel}
        aria-pressed={ariaPressed}
        {...props}
      />
    );
  },
);
IconButton.displayName = "IconButton";

export { IconButton, iconButtonVariants };
