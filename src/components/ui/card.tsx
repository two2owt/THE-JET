import * as React from "react";

import { cn } from "@/lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, style, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)}
    style={{
      borderRadius: '12px',
      // Hairline border — barely-there 5% white for the dark luxe aesthetic
      border: '1px solid hsl(0 0% 100% / 0.05)',
      // Subtle vertical gradient for depth (5-10% variation), layered over card token
      background:
        'linear-gradient(180deg, hsl(var(--card) / 0.92), hsl(var(--card) / 0.78))',
      color: 'hsl(var(--card-foreground))',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      // Soft ambient gold glow + diffused depth shadow + inset hairline highlight
      boxShadow:
        '0 0 60px hsl(var(--gold, 41 44% 58%) / 0.04), 0 20px 50px -20px rgba(0,0,0,0.7), inset 0 1px 0 hsl(0 0% 100% / 0.04)',
      ...style,
    }}
    {...props}
  />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, style, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex flex-col space-y-1.5 p-6", className)}
      style={{ display: 'flex', flexDirection: 'column', padding: '24px', gap: '6px', ...style }}
      {...props}
    />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-2xl font-semibold leading-none tracking-tight", className)} {...props} />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} style={{ fontSize: '14px', color: 'hsl(var(--muted-foreground))' }} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, style, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0", className)} style={{ padding: '0 24px 24px', ...style }} {...props} />
  ),
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, style, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex items-center p-6 pt-0", className)}
      style={{ display: 'flex', alignItems: 'center', padding: '0 24px 24px', ...style }}
      {...props}
    />
  ),
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
