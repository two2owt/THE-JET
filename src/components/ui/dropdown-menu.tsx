import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight, Circle } from "lucide-react";

import { cn } from "@/lib/utils";

const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const DropdownMenuGroup = DropdownMenuPrimitive.Group;
const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
const DropdownMenuSub = DropdownMenuPrimitive.Sub;
const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

/**
 * Shared sizing / spacing for menu items.
 * - 36px min height, 8px/12px padding
 * - 14px label, 13px description
 * - 16px lucide icons (muted by default)
 */
const itemBase =
  "group relative flex w-full cursor-pointer select-none items-center gap-2 rounded-md px-3 py-2 text-sm min-h-9 outline-none transition-colors " +
  "text-popover-foreground " +
  "focus:bg-accent/70 focus:text-accent-foreground " +
  "data-[highlighted]:bg-accent/70 data-[highlighted]:text-accent-foreground " +
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed " +
  "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground " +
  "data-[highlighted]:[&_svg]:text-accent-foreground";

const dangerItem =
  "text-destructive focus:bg-destructive/10 focus:text-destructive " +
  "data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive " +
  "[&_svg]:text-destructive data-[highlighted]:[&_svg]:text-destructive";

const contentBase =
  "z-50 min-w-[10rem] overflow-hidden rounded-lg border border-border/40 bg-popover/95 p-1.5 text-popover-foreground shadow-xl backdrop-blur-xl " +
  "data-[state=open]:animate-in data-[state=closed]:animate-out " +
  "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 " +
  "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 " +
  "data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 " +
  "data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 " +
  "duration-150";

const DropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & {
    inset?: boolean;
  }
>(({ className, inset, children, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(
      itemBase,
      "data-[state=open]:bg-accent/70 data-[state=open]:text-accent-foreground",
      inset && "pl-8",
      className,
    )}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto !text-muted-foreground" aria-hidden="true" />
  </DropdownMenuPrimitive.SubTrigger>
));
DropdownMenuSubTrigger.displayName = DropdownMenuPrimitive.SubTrigger.displayName;

/**
 * Sub-menu content. Defaults: opens to the right with 4px gap; flips to the
 * left automatically if the viewport edge is near. Override via `sideOffset`
 * and `alignOffset`.
 */
const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, sideOffset = 4, alignOffset = -4, collisionPadding = 8, ...props }, ref) => (
  <DropdownMenuPrimitive.SubContent
    ref={ref}
    sideOffset={sideOffset}
    alignOffset={alignOffset}
    collisionPadding={collisionPadding}
    className={cn(contentBase, className)}
    {...props}
  />
));
DropdownMenuSubContent.displayName = DropdownMenuPrimitive.SubContent.displayName;

/**
 * Menu content with smart positioning.
 *
 * Positioning props (all forwarded to Radix):
 * - `side`: "top" | "right" | "bottom" | "left" — default "bottom".
 * - `align`: "start" | "center" | "end" — default "center".
 * - `sideOffset`: distance (px) from trigger along `side`. Default 6.
 * - `alignOffset`: shift (px) along the alignment axis. Default 0.
 * - `collisionPadding`: viewport padding before auto-flipping. Default 8.
 *
 * Auto-flip is handled by Radix when the menu would overflow the viewport.
 */
const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(
  (
    {
      className,
      align = "center",
      sideOffset = 6,
      alignOffset = 0,
      collisionPadding = 8,
      ...props
    },
    ref,
  ) => (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        collisionPadding={collisionPadding}
        className={cn(contentBase, className)}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  ),
);
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean;
    variant?: "default" | "destructive";
  }
>(({ className, inset, variant = "default", ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(itemBase, variant === "destructive" && dangerItem, inset && "pl-8", className)}
    {...props}
  />
));
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

/**
 * Two-line menu item: label + muted description.
 * Use inside <DropdownMenuItem> children, e.g.
 *   <DropdownMenuItem><DropdownMenuItemDescription label="Profile" description="View your profile" /></DropdownMenuItem>
 */
const DropdownMenuItemDescription = ({
  label,
  description,
  className,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}) => (
  <div className={cn("flex min-w-0 flex-col leading-tight", className)}>
    <span className="truncate text-sm font-medium">{label}</span>
    {description && (
      <span className="truncate text-[12px] text-muted-foreground">{description}</span>
    )}
  </div>
);

const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    className={cn(itemBase, "pl-8", className)}
    checked={checked}
    {...props}
  >
    <span className="absolute left-2.5 flex h-4 w-4 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Check className="h-4 w-4 !text-primary" aria-hidden="true" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
));
DropdownMenuCheckboxItem.displayName = DropdownMenuPrimitive.CheckboxItem.displayName;

const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItem
    ref={ref}
    className={cn(itemBase, "pl-8", className)}
    {...props}
  >
    <span className="absolute left-2.5 flex h-4 w-4 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Circle className="h-2 w-2 fill-current !text-primary" aria-hidden="true" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.RadioItem>
));
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName;

const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn(
      "px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
      inset && "pl-8",
      className,
    )}
    {...props}
  />
));
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName;

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-border/60", className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;

const DropdownMenuShortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn(
        "ml-auto text-[11px] tracking-widest text-muted-foreground/80",
        className,
      )}
      {...props}
    />
  );
};
DropdownMenuShortcut.displayName = "DropdownMenuShortcut";

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuItemDescription,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
};
