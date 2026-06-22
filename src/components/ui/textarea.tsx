import * as React from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, style, onAnimationStart, onBlur, value, ...props }, ref) => {
    const innerRef = React.useRef<HTMLTextAreaElement | null>(null);
    const setRefs = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        innerRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
      },
      [ref],
    );

    // Sync browser-autofilled values into React state. WebKit/Blink trigger
    // the `jet-autofill-start` CSS animation on `:-webkit-autofill`.
    const handleAnimationStart = React.useCallback(
      (e: React.AnimationEvent<HTMLTextAreaElement>) => {
        if (e.animationName === "jet-autofill-start") {
          const el = innerRef.current;
          if (el && el.value) {
            const setter = Object.getOwnPropertyDescriptor(
              window.HTMLTextAreaElement.prototype,
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

    // Firefox fallback: flush DOM value on blur if it diverged from props.
    const handleBlur = React.useCallback(
      (e: React.FocusEvent<HTMLTextAreaElement>) => {
        const el = innerRef.current;
        if (el && el.value && el.value !== (value ?? "")) {
          el.dispatchEvent(new Event("input", { bubbles: true }));
        }
        onBlur?.(e);
      },
      [onBlur, value],
    );

    return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      style={{
        display: 'flex',
        minHeight: '80px',
        width: '100%',
        borderRadius: '8px',
        border: '1px solid hsl(var(--input))',
        background: 'hsl(var(--background))',
        color: 'hsl(var(--foreground))',
        padding: '8px 12px',
        fontSize: '14px',
        ...style,
      }}
        ref={setRefs}
        value={value}
        {...props}
        onAnimationStart={handleAnimationStart}
        onBlur={handleBlur}
    />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
