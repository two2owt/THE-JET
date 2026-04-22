import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";

import { cn } from "@/lib/utils";

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, style, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn(
      // Container-adaptive: square aspect, never overflows. Default size h-10 w-10 — override via className/style.
      "relative flex shrink-0 overflow-hidden rounded-full aspect-square h-10 w-10",
      className
    )}
    // containerType enables `cqw` units in AvatarFallback so text scales to container size.
    style={{ containerType: 'inline-size', ...style }}
    {...props}
  />
));
Avatar.displayName = AvatarPrimitive.Root.displayName;

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, style, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    className={cn("h-full w-full object-cover", className)}
    style={{
      // Always adapt to container: full size, cropped centered.
      width: '100%',
      height: '100%',
      maxWidth: '100%',
      maxHeight: '100%',
      objectFit: 'cover',
      objectPosition: 'center',
      display: 'block',
      ...style,
    }}
    {...props}
  />
));
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      // Adapts type-scale to container size via container queries (clamp on font-size as fallback).
      "flex h-full w-full items-center justify-center rounded-full bg-muted leading-none select-none",
      className
    )}
    style={{ fontSize: 'clamp(0.75rem, 40cqw, 2.25rem)' }}
    {...props}
  />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

export { Avatar, AvatarImage, AvatarFallback };
