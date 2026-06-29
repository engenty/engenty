import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { focusVisibleRingSubtle } from "../../../lib/focus-visible";
import { Slot } from "../../../lib/slot";
import { cn } from "../../../lib/utils";
import { sidebarColumnContentInsetEndClassName } from "./sidebar-classes";

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex shrink-0 flex-col gap-2 p-2", className)}
      data-slot="sidebar-header"
      {...props}
    />
  );
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-auto",
        className
      )}
      data-slot="sidebar-content"
      {...props}
    />
  );
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      data-slot="sidebar-group"
      {...props}
    />
  );
}

function SidebarGroupLabel({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex h-8 shrink-0 items-center rounded-md px-2 font-medium text-muted-foreground text-xs outline-none",
        className
      )}
      data-slot="sidebar-group-label"
      {...props}
    />
  );
}

function SidebarGroupContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex min-h-0 w-full min-w-0 flex-col", className)}
      data-slot="sidebar-group-content"
      {...props}
    />
  );
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      className={cn(
        "flex w-full min-w-0 flex-col gap-1",
        sidebarColumnContentInsetEndClassName,
        className
      )}
      data-slot="sidebar-menu"
      {...props}
    />
  );
}

/**
 * Standard dense list for secondary-column sidebars.
 * `SidebarMenu` with `gap-0.5` and both column insets (`pr-1`) baked in.
 * The left inset (`pl-2`) is intentionally NOT included here — list rows
 * already receive their indent from `SidebarRow`'s inline `paddingLeft`.
 * Apply `pl-2` on the containing nav/div wrapper when header-level alignment
 * is needed (search row, top nav, footer nav).
 */
function SidebarNavList({ className, ...props }: React.ComponentProps<"ul">) {
  return <SidebarMenu className={cn("gap-0.5", className)} {...props} />;
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      className={cn("group/menu-item relative", className)}
      data-slot="sidebar-menu-item"
      {...props}
    />
  );
}

const sidebarMenuButtonVariants = cva(
  `flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-md px-2 py-2 text-left text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 data-[active=true]:bg-muted data-[active=true]:font-semibold data-[active=true]:text-foreground data-[active=true]:shadow-sm [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 ${focusVisibleRingSubtle}`,
  {
    variants: {
      variant: {
        default: "",
        tree: [
          "h-auto min-w-0 flex-1 gap-1.5 px-0 py-0 text-foreground shadow-none",
          "hover:bg-transparent",
          "data-[active=true]:bg-transparent data-[active=true]:font-normal data-[active=true]:text-foreground data-[active=true]:shadow-none",
        ],
      },
      size: {
        default: "min-h-8",
        sm: "min-h-7 text-xs",
        lg: "min-h-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function SidebarMenuButton({
  asChild = false,
  className,
  isActive = false,
  size,
  variant,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof sidebarMenuButtonVariants> & {
    asChild?: boolean;
    isActive?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      className={cn(sidebarMenuButtonVariants({ variant, size, className }))}
      data-active={isActive}
      data-slot="sidebar-menu-button"
      {...props}
    />
  );
}

function SidebarMenuAction({
  asChild = false,
  className,
  showOnHover = false,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean;
  showOnHover?: boolean;
}) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      className={cn(
        "absolute top-1/2 right-1 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground outline-none transition-[color,opacity] hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
        focusVisibleRingSubtle,
        showOnHover &&
          "opacity-0 group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100",
        className
      )}
      data-slot="sidebar-menu-action"
      {...props}
    />
  );
}

function SidebarMenuBadge({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 font-medium text-muted-foreground text-xs",
        className
      )}
      data-slot="sidebar-menu-badge"
      {...props}
    />
  );
}

export {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarNavList,
  sidebarMenuButtonVariants,
};
