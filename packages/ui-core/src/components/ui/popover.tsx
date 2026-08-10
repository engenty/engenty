"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

import { type AsChildProps, isButtonLike, resolveAsChildRender } from "../../lib/as-child";
import { Slot } from "../../lib/slot";
import { cn } from "../../lib/utils";

const PopoverAnchorContext =
  React.createContext<React.RefObject<Element | null> | null>(null);

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger(props: PopoverPrimitive.Trigger.Props & AsChildProps) {
  const isButton = props.asChild ? isButtonLike(props.children) : true;
  return (
    <PopoverPrimitive.Trigger
      nativeButton={isButton}
      data-slot="popover-trigger"
      {...resolveAsChildRender(props)}
    />
  );
}

function PopoverAnchor({
  asChild = false,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & AsChildProps) {
  const anchorRef = React.useRef<Element | null>(null);
  const setAnchorRef = React.useCallback((node: Element | null) => {
    anchorRef.current = node;
  }, []);

  return (
    <PopoverAnchorContext.Provider value={anchorRef}>
      {asChild && React.isValidElement(children) ? (
        <Slot ref={setAnchorRef as React.Ref<HTMLElement>} {...props}>
          {children}
        </Slot>
      ) : (
        <div ref={setAnchorRef as React.Ref<HTMLDivElement>} {...props}>
          {children}
        </div>
      )}
    </PopoverAnchorContext.Provider>
  );
}

function PopoverContent({
  className,
  align = "center",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  collisionPadding,
  onOpenAutoFocus,
  onCloseAutoFocus,
  initialFocus,
  finalFocus,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    | "align"
    | "alignOffset"
    | "side"
    | "sideOffset"
    | "collisionPadding"
  > & {
    onOpenAutoFocus?: (event: Event) => void;
    onCloseAutoFocus?: (event: Event) => void;
  }) {
  const anchorRef = React.useContext(PopoverAnchorContext);
  const resolvedInitialFocus =
    initialFocus ??
    (onOpenAutoFocus
      ? () => {
          onOpenAutoFocus(new Event("focusin"));
          return false;
        }
      : undefined);
  const resolvedFinalFocus =
    finalFocus ??
    (onCloseAutoFocus
      ? () => {
          onCloseAutoFocus(new Event("focusout"));
          return false;
        }
      : undefined);

  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        anchor={anchorRef ?? undefined}
        className="isolate z-50"
        collisionPadding={collisionPadding}
        side={side}
        sideOffset={sideOffset}
      >
        <PopoverPrimitive.Popup
          className={cn(
            "ui-canvas-floating z-50 flex w-72 origin-(--transform-origin) flex-col gap-4 rounded-md p-4 text-sm text-popover-foreground outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          data-slot="popover-content"
          finalFocus={resolvedFinalFocus}
          initialFocus={resolvedInitialFocus}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-1 text-sm", className)}
      data-slot="popover-header"
      {...props}
    />
  );
}

function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
  return (
    <PopoverPrimitive.Title
      className={cn("font-medium", className)}
      data-slot="popover-title"
      {...props}
    />
  );
}

function PopoverDescription({
  className,
  ...props
}: PopoverPrimitive.Description.Props) {
  return (
    <PopoverPrimitive.Description
      className={cn("text-muted-foreground", className)}
      data-slot="popover-description"
      {...props}
    />
  );
}

export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
};
