import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * AuthButton — button system for /auth, /signin, /signup screens.
 *
 * Variants: primary | secondary | destructive | ghost | link
 * Sizes:    sm (32px) | md (40px) | lg (48px) | icon (square)
 * Extras:   loading (spinner, preserves width), leftIcon, rightIcon,
 *           fullWidth, asChild.
 *
 * Tokens only — no hardcoded colors. Touch target ≥44px on `md`/`lg`/`icon`,
 * relaxed on `sm` for inline use; icon-only required `ariaLabel`.
 */

const authButtonVariants = cva(
  [
    "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full",
    "font-semibold tracking-wide select-none",
    "transition-all duration-150 ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    // Suppress focus ring on pure pointer interaction; keyboard still shows it.
    "[&:focus:not(:focus-visible)]:ring-0",
    "active:scale-[0.98]",
    "disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        primary:
          "bg-gradient-to-r from-primary to-primary-glow text-primary-foreground shadow-lg shadow-primary/20 hover:-translate-y-px hover:shadow-xl hover:shadow-primary/30",
        secondary:
          "border border-border/60 bg-card/40 text-foreground backdrop-blur-sm hover:border-primary/50 hover:bg-primary/10 hover:text-primary",
        destructive:
          "bg-destructive text-destructive-foreground shadow-md shadow-destructive/20 hover:bg-destructive/90 hover:-translate-y-px",
        ghost:
          "bg-transparent text-foreground/85 hover:bg-accent/10 hover:text-foreground",
        link:
          "h-auto rounded-sm bg-transparent px-1 py-0.5 font-medium text-primary underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        sm: "h-8 px-3 text-[13px] [&_svg]:h-3.5 [&_svg]:w-3.5",
        md: "h-10 px-4 text-sm min-h-[44px] sm:min-h-[40px] [&_svg]:h-4 [&_svg]:w-4",
        lg: "h-12 px-6 text-base min-h-[48px] [&_svg]:h-5 [&_svg]:w-5",
        icon: "h-11 w-11 min-h-[44px] min-w-[44px] p-0 [&_svg]:h-5 [&_svg]:w-5",
      },
      fullWidth: {
        true: "w-full",
        false: "",
      },
    },
    compoundVariants: [
      // `link` variant ignores size paddings — text-flow only.
      { variant: "link", size: "sm", class: "h-auto min-h-0 px-1 text-[13px]" },
      { variant: "link", size: "md", class: "h-auto min-h-0 px-1 text-sm" },
      { variant: "link", size: "lg", class: "h-auto min-h-0 px-1 text-base" },
    ],
    defaultVariants: {
      variant: "primary",
      size: "md",
      fullWidth: false,
    },
  },
);

type IconOnlyProps =
  | { size: "icon"; ariaLabel: string; children: React.ReactNode }
  | { size?: Exclude<NonNullable<VariantProps<typeof authButtonVariants>["size"]>, "icon">; ariaLabel?: string; children?: React.ReactNode };

export type AuthButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> &
  Omit<VariantProps<typeof authButtonVariants>, "size"> &
  IconOnlyProps & {
    asChild?: boolean;
    loading?: boolean;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
  };

const AuthButton = React.forwardRef<HTMLButtonElement, AuthButtonProps>(
  (
    {
      className,
      variant,
      size,
      fullWidth,
      asChild = false,
      loading = false,
      leftIcon,
      rightIcon,
      ariaLabel,
      children,
      disabled,
      type,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    const isDisabled = disabled || loading;
    const isIconOnly = size === "icon";

    const content = asChild ? (
      (children as React.ReactElement)
    ) : (
      <>
        {/* Keep layout stable while loading: hide content but preserve width. */}
        <span
          className={cn(
            "inline-flex items-center gap-2",
            loading && "invisible",
          )}
          aria-hidden={loading || undefined}
        >
          {leftIcon}
          {children}
          {rightIcon}
        </span>
        {loading && (
          <span
            className="absolute inset-0 inline-flex items-center justify-center"
            aria-hidden="true"
          >
            <Loader2 className="animate-spin" />
          </span>
        )}
      </>
    );

    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : (type ?? "button")}
        className={cn(authButtonVariants({ variant, size, fullWidth, className }))}
        disabled={asChild ? undefined : isDisabled}
        aria-disabled={isDisabled || undefined}
        aria-busy={loading || undefined}
        aria-label={isIconOnly ? ariaLabel : props["aria-label"]}
        {...props}
      >
        {content}
      </Comp>
    );
  },
);
AuthButton.displayName = "AuthButton";

/**
 * AuthButtonGroup — connected button row with shared borders.
 * Children should be `<AuthButton variant="secondary" />` for best results.
 */
const AuthButtonGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { ariaLabel?: string }
>(({ className, ariaLabel, ...props }, ref) => (
  <div
    ref={ref}
    role="group"
    aria-label={ariaLabel}
    className={cn(
      "inline-flex items-stretch rounded-full border border-border/60 bg-card/30 p-0.5 backdrop-blur-sm",
      "[&>*]:rounded-full [&>*]:border-0 [&>*]:shadow-none [&>*]:bg-transparent",
      "[&>*]:hover:bg-primary/10",
      className,
    )}
    {...props}
  />
));
AuthButtonGroup.displayName = "AuthButtonGroup";

export { AuthButton, AuthButtonGroup, authButtonVariants };