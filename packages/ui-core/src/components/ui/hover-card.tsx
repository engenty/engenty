"use client";

import * as React from "react";
import { PreviewCard as PreviewCardPrimitive } from "@base-ui/react/preview-card";

import { type AsChildProps, resolveAsChildRender } from "../../lib/as-child";
import { cn } from "../../lib/utils";

const HoverCardDelayContext = React.createContext<{
  closeDelay?: number;
  delay?: number;
}>({});

function HoverCard({
  openDelay,
  closeDelay,
  onOpenChange,
  children,
  ...props
}: PreviewCardPrimitive.Root.Props & {
  closeDelay?: number;
  openDelay?: number;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <HoverCardDelayContext.Provider
      value={{ delay: openDelay, closeDelay }}
    >
      <PreviewCardPrimitive.Root
        data-slot="hover-card"
        onOpenChange={(open) => {
          onOpenChange?.(open);
        }}
        {...props}
      >
        {children}
      </PreviewCardPrimitive.Root>
    </HoverCardDelayContext.Provider>
  );
}

function HoverCardTrigger({
  delay,
  closeDelay,
  ...props
}: PreviewCardPrimitive.Trigger.Props & AsChildProps) {
  const inherited = React.useContext(HoverCardDelayContext);

  return (
    <PreviewCardPrimitive.Trigger
      closeDelay={closeDelay ?? inherited.closeDelay}
      data-slot="hover-card-trigger"
      delay={delay ?? inherited.delay}
      {...resolveAsChildRender(props)}
    />
  );
}

function HoverCardContent({
  className,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  alignOffset = 4,
  ...props
}: PreviewCardPrimitive.Popup.Props &
  Pick<
    PreviewCardPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <PreviewCardPrimitive.Portal data-slot="hover-card-portal">
      <PreviewCardPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        className="isolate z-50"
        side={side}
        sideOffset={sideOffset}
      >
        <PreviewCardPrimitive.Popup
          className={cn(
            "ui-canvas-floating z-50 w-64 origin-(--transform-origin) rounded-lg p-4 text-sm text-popover-foreground outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          data-slot="hover-card-content"
          {...props}
        />
      </PreviewCardPrimitive.Positioner>
    </PreviewCardPrimitive.Portal>
  );
}

export { HoverCard, HoverCardTrigger, HoverCardContent };
