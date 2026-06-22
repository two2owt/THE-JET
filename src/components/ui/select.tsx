import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Browser autofill bridge for Radix Select.
 *
 * Radix's `Select` is a custom button widget, so browsers can't autofill it
 * directly. We mirror the current value into a visually hidden native
 * `<select>` that registers its options via context from `SelectItem`s. When
 * the browser autofills (or otherwise sets) the hidden select, we route the
 * value back through Radix's `onValueChange`.
 *
 * Activate by passing `name` and/or `autoComplete` to `<Select>`.
 */
type AutofillOption = { value: string; label: string };
type AutofillCtx = {
  registerOption: (value: string, label: string) => void;
  unregisterOption: (value: string) => void;
} | null;
const SelectAutofillContext = React.createContext<AutofillCtx>(null);

/**
 * Validation context for Select. Lets the trigger render an invalid state
 * and lets `SelectFormMessage` render the error in the right slot without
 * the consumer wiring ids manually.
 */
type ValidationCtx = {
  required: boolean;
  invalid: boolean;
  error?: string;
  errorId: string;
} | null;
const SelectValidationContext = React.createContext<ValidationCtx>(null);

let selectErrorIdCounter = 0;
const nextErrorId = () => `select-error-${++selectErrorIdCounter}`;

type SelectRootProps = React.ComponentProps<typeof SelectPrimitive.Root> & {
  name?: string;
  autoComplete?: string;
  /** Optional id for the hidden native select (for label association). */
  autofillId?: string;
  /** Mark the field as required. Validated on form submit. */
  required?: boolean;
  /** Inline error message — renders via <SelectFormMessage /> and styles the trigger as invalid. */
  error?: string;
};

const Select = ({
  name,
  autoComplete,
  autofillId,
  required = false,
  error,
  value,
  defaultValue,
  onValueChange,
  children,
  ...rootProps
}: SelectRootProps) => {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = React.useState<string | undefined>(defaultValue);
  const currentValue = isControlled ? value : internalValue;
  const hiddenRef = React.useRef<HTMLSelectElement | null>(null);
  const [options, setOptions] = React.useState<AutofillOption[]>([]);
  const errorIdRef = React.useRef<string>(nextErrorId());

  const ctx = React.useMemo<AutofillCtx>(
    () => ({
      registerOption: (val, label) => {
        setOptions((prev) => {
          const next = prev.filter((o) => o.value !== val);
          next.push({ value: val, label });
          return next;
        });
      },
      unregisterOption: (val) => {
        setOptions((prev) => prev.filter((o) => o.value !== val));
      },
    }),
    [],
  );

  const handleValueChange = React.useCallback(
    (next: string) => {
      if (!isControlled) setInternalValue(next);
      onValueChange?.(next);
    },
    [isControlled, onValueChange],
  );

  const handleHiddenChange = React.useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const next = e.target.value;
      if (next && next !== currentValue) handleValueChange(next);
    },
    [currentValue, handleValueChange],
  );

  // Autofill on a native select fires `change`, but some browsers only emit
  // the `:-webkit-autofill` animation hook — react to that too.
  const handleHiddenAnimationStart = React.useCallback(
    (e: React.AnimationEvent<HTMLSelectElement>) => {
      if (e.animationName !== "jet-autofill-start") return;
      const el = hiddenRef.current;
      if (el && el.value && el.value !== currentValue) handleValueChange(el.value);
    },
    [currentValue, handleValueChange],
  );

  const autofillEnabled = !!(name || autoComplete);
  const hiddenNeeded = autofillEnabled || required;

  const validation = React.useMemo<ValidationCtx>(
    () => ({
      required,
      invalid: !!error,
      error,
      errorId: errorIdRef.current,
    }),
    [required, error],
  );

  return (
    <SelectValidationContext.Provider value={validation}>
      <SelectAutofillContext.Provider value={hiddenNeeded ? ctx : null}>
        <SelectPrimitive.Root
        {...rootProps}
        value={isControlled ? value : internalValue}
        defaultValue={isControlled ? undefined : defaultValue}
        onValueChange={handleValueChange}
      >
        {children}
      </SelectPrimitive.Root>
      {hiddenNeeded && (
        <select
          ref={hiddenRef}
          id={autofillId}
          name={name}
          autoComplete={autoComplete}
          required={required}
          tabIndex={-1}
          aria-hidden="true"
          value={currentValue ?? ""}
          onChange={handleHiddenChange}
          onAnimationStart={handleHiddenAnimationStart}
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: "hidden",
            clip: "rect(0 0 0 0)",
            whiteSpace: "nowrap",
            border: 0,
            opacity: 0,
            pointerEvents: "none",
          }}
        >
          <option value="" />
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
      </SelectAutofillContext.Provider>
    </SelectValidationContext.Provider>
  );
};
Select.displayName = "Select";

const SelectGroup = SelectPrimitive.Group;

const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => {
  const validation = React.useContext(SelectValidationContext);
  const invalid = !!validation?.invalid;
  const describedBy =
    [props["aria-describedby"], invalid ? validation?.errorId : undefined]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      aria-invalid={invalid || props["aria-invalid"]}
      aria-required={validation?.required || props["aria-required"]}
      aria-describedby={describedBy}
      data-invalid={invalid ? "" : undefined}
      className={cn(
        "flex h-11 min-h-[44px] w-full items-center justify-between rounded-xl border border-border/40 bg-card backdrop-blur-xl px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-0 focus:border-primary/60 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1 transition-all duration-300 hover:bg-card/80 hover:border-border/60 shadow-lg touch-manipulation",
        "data-[invalid]:border-destructive data-[invalid]:focus:ring-destructive/50",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="h-4 w-4 opacity-50 transition-transform duration-300 data-[state=open]:rotate-180" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
});
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1", className)}
    {...props}
  >
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1", className)}
    {...props}
  >
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", style, ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        "relative z-[100] max-h-96 min-w-[8rem] overflow-hidden rounded-xl border border-border/40 bg-popover backdrop-blur-xl text-popover-foreground shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2",
        position === "popper" &&
          "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
        className,
      )}
      position={position}
      style={{
        background: 'hsl(var(--popover))',
        color: 'hsl(var(--popover-foreground))',
        border: '1px solid hsl(var(--border) / 0.4)',
        borderRadius: '12px',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.05)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        zIndex: 100,
        overflow: 'hidden',
        ...style,
      }}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn(
          "p-1",
          position === "popper" &&
            "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]",
        )}
        style={{ padding: '4px' }}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label ref={ref} className={cn("py-1.5 pl-8 pr-2 text-sm font-semibold", className)} {...props} />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, value, ...props }, ref) => {
  const autofill = React.useContext(SelectAutofillContext);
  const label = React.useMemo(() => {
    if (typeof children === "string" || typeof children === "number") return String(children);
    return value;
  }, [children, value]);
  React.useEffect(() => {
    if (!autofill || !value) return;
    autofill.registerOption(value, label ?? value);
    return () => autofill.unregisterOption(value);
  }, [autofill, value, label]);
  return (
  <SelectPrimitive.Item
    ref={ref}
    value={value}
    className={cn(
      "relative flex w-full cursor-pointer select-none items-center rounded-lg py-3 pl-8 pr-2 text-sm outline-none min-h-[44px] text-popover-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 focus:bg-primary/10 focus:text-foreground data-[state=checked]:bg-primary/10 data-[state=checked]:text-foreground transition-all duration-200 hover:bg-primary/10 hover:text-foreground touch-manipulation",
      className,
    )}
    style={{
      display: 'flex',
      alignItems: 'center',
      padding: '12px 8px 12px 32px',
      borderRadius: '8px',
      fontSize: '14px',
      cursor: 'pointer',
      color: 'hsl(var(--popover-foreground))',
      minHeight: '44px',
    }}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4 text-primary animate-in zoom-in-50 duration-200" />
      </SelectPrimitive.ItemIndicator>
    </span>

    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
  );
});
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator ref={ref} className={cn("-mx-1 my-1 h-px bg-muted", className)} {...props} />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
