import * as React from "react";
import { cn } from "../../utils";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./sheet";

const SidePanel = Sheet;
const SidePanelTrigger = SheetTrigger;
const SidePanelClose = SheetClose;

const SidePanelContent = React.forwardRef<
  React.ElementRef<typeof SheetContent>,
  React.ComponentPropsWithoutRef<typeof SheetContent>
>(({ className, hideOverlay, side = "right", children, ...props }, ref) => (
  <SheetContent
    className={cn("w-full sm:max-w-md lg:max-w-lg", className)}
    hideOverlay={hideOverlay}
    ref={ref}
    side={side}
    {...props}
  >
    {children}
  </SheetContent>
));
SidePanelContent.displayName = "SidePanelContent";

const SidePanelHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <SheetHeader className={cn("text-left", className)} {...props} />
);
SidePanelHeader.displayName = "SidePanelHeader";

const SidePanelTitle = React.forwardRef<
  React.ElementRef<typeof SheetTitle>,
  React.ComponentPropsWithoutRef<typeof SheetTitle>
>(({ className, ...props }, ref) => (
  <SheetTitle className={cn("text-left", className)} ref={ref} {...props} />
));
SidePanelTitle.displayName = "SidePanelTitle";

const SidePanelDescription = React.forwardRef<
  React.ElementRef<typeof SheetDescription>,
  React.ComponentPropsWithoutRef<typeof SheetDescription>
>(({ className, ...props }, ref) => (
  <SheetDescription
    className={cn("text-left", className)}
    ref={ref}
    {...props}
  />
));
SidePanelDescription.displayName = "SidePanelDescription";

const SidePanelFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <SheetFooter
    className={cn(
      "flex flex-col-reverse border-t pt-4 sm:flex-row sm:justify-end sm:gap-2",
      className
    )}
    {...props}
  />
);
SidePanelFooter.displayName = "SidePanelFooter";

export {
  SidePanel,
  SidePanelTrigger,
  SidePanelClose,
  SidePanelContent,
  SidePanelDescription,
  SidePanelHeader,
  SidePanelTitle,
  SidePanelFooter,
};
