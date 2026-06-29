"use client";

/**
 * Notion-style contextual hover-dropdown list (default) or click-to-open (Drive-style).
 *
 * Default `openOn="hover"`: opens on pointer entering the trigger; uses DropdownMenu for
 * portal + keyboard-dismiss, with a short delayed close when the pointer leaves the trigger
 * so users can bridge into the menu (`cancelClose` on content `mouseEnter`).
 *
 * `openOn="click"`: Radix trigger click only; no hover timers on trigger or content.
 */

import type { ComponentProps, ReactElement, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../../lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu";

export interface ContextPopoverItem {
  icon?: ReactNode;
  id: string;
  isActive?: boolean;
  label: string;
  onClick?: () => void;
  /** When provided (and `renderLink` is set) renders the item as a link. */
  to?: string;
}

/** Grouped items with an optional small uppercase header; used with {@link ContextPopoverListProps.sections}. */
export interface ContextPopoverSection {
  contextLabel?: string;
  id: string;
  items: ContextPopoverItem[];
}

export interface ContextPopoverFooter {
  icon?: ReactNode;
  label: string;
  onClick?: () => void;
  to?: string;
}

export type ContextPopoverRenderLink = (props: {
  to: string;
  className: string;
  onClick?: () => void;
  children: ReactNode;
}) => ReactElement;

/** How the menu opens. Default `hover` keeps Notion-style hover menus; `click` is Drive-style. */
export type ContextPopoverOpenOn = "click" | "hover";

export interface ContextPopoverListProps {
  align?: "start" | "center" | "end";
  /** Extra class on the dropdown content panel. */
  className?: string;
  /** Small uppercase section header shown above the item list. Omit to skip the header. */
  contextLabel?: string;
  emptyMessage?: string;
  footer?: ContextPopoverFooter;
  /** Rich panel above items/sections (title, metadata rows). */
  header?: ReactNode;
  isLoading?: boolean;
  /** Flat list (default). Ignored when {@link sections} is non-empty. */
  items?: ContextPopoverItem[];
  onOpenChange?: (open: boolean) => void;
  /** Controlled open state — leave unset for uncontrolled. */
  open?: boolean;
  /**
   * `hover`: open on pointer entering the trigger; closing uses trigger `mouseLeave` plus
   * content `mouseEnter`/`mouseLeave` with a short delay (bridge into the portal).
   * `click`: open/close via trigger click and Radix dismiss; no hover timers on trigger/content.
   */
  openOn?: ContextPopoverOpenOn;
  renderLink?: ContextPopoverRenderLink;
  /**
   * When non-empty, renders multiple groups with a separator between groups.
   * Takes precedence over flat {@link items}.
   */
  sections?: ContextPopoverSection[];
  /** The trigger element (button, span with chevron, etc.) */
  trigger: ReactElement;
}

const ITEM_BASE =
  "group/item flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent text-left cursor-default select-none outline-none";
const ITEM_ACTIVE = "bg-accent/50 font-medium text-foreground";
const ITEM_MUTED = "text-muted-foreground hover:text-foreground";

export function ContextPopoverList({
  trigger,
  contextLabel,
  header,
  items: itemsProp,
  sections,
  footer,
  isLoading,
  emptyMessage,
  align = "start",
  renderLink,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  className,
  openOn = "hover",
}: ContextPopoverListProps) {
  const items = itemsProp ?? [];
  const useSections = (sections?.length ?? 0) > 0;

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
    },
    []
  );

  function scheduleClose() {
    closeTimer.current = setTimeout(() => {
      if (isControlled) {
        controlledOnOpenChange?.(false);
      } else {
        setInternalOpen(false);
      }
    }, 250);
  }

  function cancelClose() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function openNow() {
    cancelClose();
    if (isControlled) {
      controlledOnOpenChange?.(true);
    } else {
      setInternalOpen(true);
    }
  }

  function handleOpenChange(next: boolean) {
    if (isControlled) {
      controlledOnOpenChange?.(next);
    } else {
      setInternalOpen(next);
    }
  }

  function handleMenuOpenChange(
    next: boolean,
    eventDetails?: Parameters<
      NonNullable<ComponentProps<typeof DropdownMenu>["onOpenChange"]>
    >[1]
  ) {
    if (
      openOn === "hover" &&
      !next &&
      eventDetails &&
      (eventDetails.reason === "outside-press" ||
        eventDetails.reason === "focus-out" ||
        eventDetails.reason === "escape-key")
    ) {
      eventDetails.cancel();
      return;
    }
    handleOpenChange(next);
  }

  const handleClose = () => handleOpenChange(false);

  function renderItem(item: ContextPopoverItem) {
    const cls = cn(ITEM_BASE, item.isActive ? ITEM_ACTIVE : ITEM_MUTED);
    const content = (
      <>
        {item.icon && (
          <span className="size-4 shrink-0 text-muted-foreground/60">
            {item.icon}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
      </>
    );

    if (item.to && renderLink) {
      return renderLink({
        to: item.to,
        className: cls,
        onClick: () => {
          item.onClick?.();
          handleClose();
        },
        children: content,
      });
    }

    return (
      <button
        className={cls}
        onClick={() => {
          item.onClick?.();
          handleClose();
        }}
        type="button"
      >
        {content}
      </button>
    );
  }

  // Pointer events bridge the gap between trigger and portaled content more reliably
  // than mouse events alone (avoids open → Radix outside-close flash → reopen).
  const hoverBridgeHandlers =
    openOn === "hover"
      ? {
          onPointerEnter: openNow,
          onPointerLeave: scheduleClose,
        }
      : {};

  const contentHoverHandlers =
    openOn === "hover"
      ? {
          onPointerEnter: cancelClose,
          onPointerLeave: scheduleClose,
        }
      : {};

  const hoverFinalFocus = openOn === "hover" ? () => false : undefined;

  function renderSectionBlock(section: ContextPopoverSection, index: number) {
    return (
      <div key={section.id}>
        {index > 0 && <div aria-hidden className="my-1 h-px bg-border/40" />}
        {section.contextLabel && (
          <p className="px-2 py-1 font-semibold text-muted-foreground/50 text-xxs uppercase tracking-wide">
            {section.contextLabel}
          </p>
        )}
        {section.items.map((item) => (
          <div key={item.id}>{renderItem(item)}</div>
        ))}
      </div>
    );
  }

  function renderFooterItem() {
    if (!footer) {
      return null;
    }
    const cls =
      "flex w-full items-center gap-2 rounded-sm px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-default select-none";
    const content = (
      <>
        {footer.icon && (
          <span className="size-3.5 shrink-0">{footer.icon}</span>
        )}
        <span>{footer.label}</span>
      </>
    );

    if (footer.to && renderLink) {
      return renderLink({
        to: footer.to,
        className: cls,
        onClick: () => {
          footer.onClick?.();
          handleClose();
        },
        children: content,
      });
    }

    return (
      <button
        className={cls}
        onClick={() => {
          footer.onClick?.();
          handleClose();
        }}
        type="button"
      >
        {content}
      </button>
    );
  }

  const flatItemCount = useSections
    ? (sections?.reduce((n, s) => n + s.items.length, 0) ?? 0)
    : items.length;

  return (
    <DropdownMenu
      modal={openOn !== "hover"}
      onOpenChange={handleMenuOpenChange}
      open={open}
    >
      <DropdownMenuTrigger asChild {...hoverBridgeHandlers}>
        {trigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        className={cn(
          "max-h-[min(24rem,70vh)] w-56 overflow-y-auto p-1.5",
          openOn === "hover" && "relative pt-2.5",
          className
        )}
        finalFocus={hoverFinalFocus}
        {...contentHoverHandlers}
        sideOffset={openOn === "hover" ? 0 : 4}
      >
        {openOn === "hover" ? (
          <div
            aria-hidden
            className="pointer-events-auto absolute inset-x-0 -top-2 h-2"
          />
        ) : null}
        {!useSections && contextLabel && (
          <p className="px-2 py-1 font-semibold text-muted-foreground/50 text-xxs uppercase tracking-wide">
            {contextLabel}
          </p>
        )}

        {header ? <div className="px-1.5 pb-1">{header}</div> : null}

        {isLoading && (
          <div className="space-y-1 px-1 py-1">
            {[1, 2, 3].map((i) => (
              <div className="h-7 animate-pulse rounded bg-muted/60" key={i} />
            ))}
          </div>
        )}

        {!isLoading && flatItemCount === 0 && emptyMessage && (
          <p className="px-2 py-1.5 text-muted-foreground/60 text-sm">
            {emptyMessage}
          </p>
        )}

        {!isLoading &&
          useSections &&
          sections?.map((section, index) => renderSectionBlock(section, index))}

        {!(isLoading || useSections) &&
          items.map((item) => <div key={item.id}>{renderItem(item)}</div>)}

        {footer && (
          <div className="mt-1 border-border/40 border-t pt-1">
            {renderFooterItem()}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
