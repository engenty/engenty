import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { focusVisibleRingSubtle } from "../../lib/focus-visible";
import { cn } from "../../lib/utils";

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className,
      )}
      data-orientation={orientation}
      data-slot="tabs"
      orientation={orientation}
      {...props}
    />
  );
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center text-muted-foreground group-data-horizontal/tabs:h-9 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col",
  {
    variants: {
      variant: {
        default: "rounded-lg bg-muted p-[3px]",
        line: "gap-1 rounded-none bg-transparent p-0",
        segmented: "gap-1 rounded-none bg-transparent p-0",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function TabsList({
  className,
  variant = "default",
  trailing,
  ...props
}: TabsPrimitive.List.Props &
  VariantProps<typeof tabsListVariants> & { trailing?: React.ReactNode }) {
  const list = (
    <TabsPrimitive.List
      className={cn(tabsListVariants({ variant }), className)}
      data-slot="tabs-list"
      data-variant={variant}
      {...props}
    />
  );

  if (!trailing) return list;

  return (
    <div className="flex items-center" data-slot="tabs-list-container">
      {list}
      {trailing}
    </div>
  );
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent px-2 py-1 font-medium text-foreground/60 text-sm outline-none transition-colors transition-shadow hover:text-foreground disabled:pointer-events-none disabled:opacity-50 group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start group-data-[variant=default]/tabs-list:data-active:shadow-sm dark:text-muted-foreground dark:hover:text-foreground [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        focusVisibleRingSubtle,
        "group-data-[variant=line]/tabs-list:rounded-none group-data-[variant=line]/tabs-list:border-0 group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:px-4 group-data-[variant=line]/tabs-list:py-2 group-data-[variant=line]/tabs-list:shadow-none group-data-[variant=line]/tabs-list:data-active:bg-transparent group-data-[variant=line]/tabs-list:data-active:text-foreground group-data-[variant=line]/tabs-list:dark:data-active:bg-transparent group-data-[variant=line]/tabs-list:dark:data-active:border-0",
        "group-data-[variant=segmented]/tabs-list:rounded-md group-data-[variant=segmented]/tabs-list:border group-data-[variant=segmented]/tabs-list:border-input group-data-[variant=segmented]/tabs-list:bg-muted/80 group-data-[variant=segmented]/tabs-list:px-3 group-data-[variant=segmented]/tabs-list:py-2 group-data-[variant=segmented]/tabs-list:data-active:bg-background group-data-[variant=segmented]/tabs-list:data-active:border-input group-data-[variant=segmented]/tabs-list:data-active:text-foreground group-data-[variant=segmented]/tabs-list:data-active:shadow-sm",
        "data-active:bg-background data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground",
        "after:absolute after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-[variant=default]/tabs-list:group-data-horizontal/tabs:after:bottom-[-5px] group-data-[variant=segmented]/tabs-list:group-data-horizontal/tabs:after:bottom-[-5px] group-data-[variant=line]/tabs-list:after:bottom-[-1px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:w-0.5 after:bg-foreground group-data-[variant=line]/tabs-list:after:bg-[var(--ember)] group-data-[variant=line]/tabs-list:data-active:after:opacity-100 group-data-[variant=segmented]/tabs-list:data-active:after:opacity-100",
        className,
      )}
      data-slot="tabs-trigger"
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      className={cn("flex-1 outline-none", className)}
      data-slot="tabs-content"
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
