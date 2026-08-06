import {
  Button,
  cn,
  sidebarColumnContentInsetClassName,
} from "@engenty/ui-core";
import { usePageHeader } from "@engenty/ui-plugin-sdk";
import { PanelLeft, PanelLeftClose, Pin } from "lucide-react";
import type { ReactNode } from "react";
import { ModuleSecondaryNavPanel } from "./module-secondary-nav-panel";
import type { SecondaryNavLinkItem } from "./types";

export function ModuleSecondaryNavColumnShell(props: {
  bodyMinWidthPx: number;
  /**
   * When false, do not mount page-header sidebar chrome (`secondaryNavHeaderSlot`
   * / `secondaryNavAfterItems`). Used for foreign dock previews (Settings, etc.).
   */
  includePageSlots?: boolean;
  /** Header override when `includePageSlots` is false (e.g. Settings label). */
  headerSlot?: ReactNode;
  onNavigate?: () => void;
  onToggle: () => void;
  pathname: string;
  search: string;
  secondaryItems: SecondaryNavLinkItem[];
  showToggle?: boolean;
  toggleMode: "collapse" | "pinOpen";
  forceHover?: boolean;
}) {
  const {
    bodyMinWidthPx,
    includePageSlots = true,
    headerSlot,
    onNavigate,
    onToggle,
    pathname,
    search,
    secondaryItems,
    showToggle = true,
    toggleMode,
    forceHover = false,
  } = props;
  const { secondaryNavHeaderSlot, topbarChrome } = usePageHeader();
  const contentBlend = includePageSlots && topbarChrome === "contentBlend";
  // Foreign dock previews need opaque floating chrome so page content cannot
  // bleed through the translucent pinOpen blend surface.
  const blendSurface = includePageSlots && toggleMode === "pinOpen";
  const resolvedHeaderSlot = includePageSlots
    ? secondaryNavHeaderSlot
    : headerSlot;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden",
        blendSurface ? "bg-transparent" : "ui-canvas-floating"
      )}
      data-engenty-region="sidebar"
    >
      <div
        className={cn(
          "flex shrink-0 items-center gap-1",
          contentBlend ? "px-2" : "px-3",
          contentBlend ? "h-11" : "h-[52px] border-border/30 border-b",
          blendSurface ? "bg-transparent" : "ui-canvas-floating"
        )}
      >
        {showToggle ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              className={cn(
                "shrink-0 opacity-40 transition-opacity hover:opacity-100 focus-visible:opacity-100",
                toggleMode === "pinOpen" && "group",
                forceHover && "opacity-100"
              )}
              data-sidebar-toggle
              onClick={onToggle}
              size={contentBlend ? "icon-sm" : "icon"}
              variant="ghost"
            >
              {toggleMode === "collapse" ? (
                <PanelLeftClose className="size-4" />
              ) : (
                <span
                  aria-hidden
                  className="isolate grid size-4 shrink-0 place-items-center [&>svg]:col-start-1 [&>svg]:row-start-1"
                >
                  <PanelLeft
                    className={cn(
                      "size-4 group-hover:invisible",
                      forceHover && "invisible"
                    )}
                  />
                  <Pin
                    className={cn(
                      "invisible size-4 group-hover:visible",
                      forceHover && "visible"
                    )}
                  />
                </span>
              )}
              <span className="sr-only">
                {toggleMode === "collapse"
                  ? "Toggle navigation"
                  : "Pin module navigation open"}
              </span>
            </Button>
          </div>
        ) : null}
        <div className="flex min-w-0 flex-1 items-center gap-1">
          {resolvedHeaderSlot ? (
            <div
              className={cn(
                "min-w-0 flex-1 overflow-hidden",
                !showToggle && sidebarColumnContentInsetClassName
              )}
            >
              {resolvedHeaderSlot}
            </div>
          ) : null}
        </div>
      </div>

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-y-auto",
          blendSurface ? "bg-transparent" : "ui-canvas-floating"
        )}
        style={{ minWidth: bodyMinWidthPx }}
      >
        <ModuleSecondaryNavPanel
          includeAfterItems={includePageSlots}
          onNavigate={onNavigate}
          pathname={pathname}
          search={search}
          secondaryItems={secondaryItems}
        />
      </div>
    </div>
  );
}
