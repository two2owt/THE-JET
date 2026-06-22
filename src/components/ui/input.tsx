import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, style, onAnimationStart, ...props }, ref) => {
    const innerRef = React.useRef<HTMLInputElement | null>(null);
    const setRefs = React.useCallback(
      (node: HTMLInputElement | null) => {
        innerRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
      },
      [ref],
    );

    // Sync browser-autofilled values into React state.
    // Chrome/Safari trigger a CSS animation named `jet-autofill-start` on
    // `:-webkit-autofill`. We listen for it and dispatch a native `input`
    // event so controlled components pick up the value.
    const handleAnimationStart = React.useCallback(
      (e: React.AnimationEvent<HTMLInputElement>) => {
        if (e.animationName === "jet-autofill-start") {
          const el = innerRef.current;
          if (el && el.value) {
            const setter = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype,
              "value",
            )?.set;
            setter?.call(el, el.value);
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }
        onAnimationStart?.(e);
      },
      [onAnimationStart],
    );

    // Firefox fires no autofill event; flush DOM value on blur as a fallback.
    const handleBlur = React.useCallback(
      (e: React.FocusEvent<HTMLInputElement>) => {
        const el = innerRef.current;
        if (el && el.value && el.value !== (props.value ?? "")) {
          el.dispatchEvent(new Event("input", { bubbles: true }));
        }
        props.onBlur?.(e);
      },
      [props],
    );

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
          // Hairline border + slightly elevated surface for luxe inputs
          border: '1px solid hsl(0 0% 100% / 0.06)',
          background: 'hsl(var(--popover) / 0.6)',
          color: 'hsl(var(--foreground))',
          padding: '8px 12px',
          fontSize: '16px',
          letterSpacing: '0.01em',
          transition: 'border-color 400ms ease-out, box-shadow 400ms ease-out, background-color 400ms ease-out',
          ...style,
        }}
        ref={setRefs}
        {...props}
        onAnimationStart={handleAnimationStart}
        onBlur={handleBlur}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
