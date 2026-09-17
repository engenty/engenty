"use client";

// The desk's panel vocabulary (`panel=manage|runs`, plus the panel's own
// `routine` / `workflow` / `run` keys) and the resizable side-sheet shell a
// ROOM still fills with its info. The specialist's own settings and runs
// moved out of the sheet into the workspace end-pane column
// (`agent-desk-pane.tsx`); the URL keys stayed, so links minted for the
// drawer open the pane.
import {
  PaneResizeHandle,
  usePersistedEwResizePaneWidth,
} from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { Button, Sheet, SheetContent, SheetTitle } from "@engenty/ui-core";
import { ChevronLeftIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";

export const AGENT_DESK_PANELS = ["manage", "runs"] as const;
export type AgentDeskPanel = (typeof AGENT_DESK_PANELS)[number];

/** The panel's own URL keys — dropped together with `panel` on close. */
export const AGENT_DESK_PANEL_STATE_KEYS = [
  "routine",
  "workflow",
  "run",
] as const;

/**
 * Unknown/absent → no drawer. Links minted before the drawer (`tab=manage`,
 * `tab=plan` from chat answers and notifications) still open the settings.
 */
export function parseAgentDeskPanel(
  value: string | null
): AgentDeskPanel | null {
  if (value === "plan") {
    return "manage";
  }
  return AGENT_DESK_PANELS.includes(value as AgentDeskPanel)
    ? (value as AgentDeskPanel)
    : null;
}

/**
 * The drawer itself — a resizable right Sheet with a title row — without a
 * say in what it holds. The desk fills it with Settings or Runs; a room fills
 * it with its info. One shell, so the two slide, resize and remember their
 * width the same way.
 */
export function AgentDeskDrawerShell({
  children,
  onBack,
  onClose,
  open,
  title,
}: {
  children: ReactNode;
  /** A step back inside the drawer (out of an open routine); hidden when null. */
  onBack?: (() => void) | null;
  onClose: () => void;
  open: boolean;
  title: ReactNode;
}) {
  const { t } = useTranslation("ai-ui");
  const {
    displayedWidthPx,
    handleResizeKeyDown,
    handleResizePointerDown,
    isResizing,
  } = usePersistedEwResizePaneWidth({
    defaultPx: 560,
    // The handle sits on the drawer's LEFT edge: dragging left grows it.
    invert: true,
    maxPx: 1040,
    minPx: 400,
    storageKey: "engenty.agent_desk_drawer.width_px",
  });

  return (
    <Sheet
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      open={open}
    >
      <SheetContent
        className="w-full gap-0 sm:max-w-none"
        showCloseButton={false}
        side="right"
        style={{ maxWidth: "100vw", width: displayedWidthPx }}
      >
        {/* The handle is the drawer's left edge, full height, over the border. */}
        <div className="absolute inset-y-0 -left-1 z-10 hidden sm:block">
          <PaneResizeHandle
            isResizing={isResizing}
            label={t("agentDesk.drawer.resize")}
            onKeyDown={handleResizeKeyDown}
            onPointerDown={handleResizePointerDown}
          />
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-1">
            {onBack ? (
              <Button
                aria-label={t("agentDesk.drawer.back")}
                className="-ml-2"
                onClick={onBack}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <ChevronLeftIcon className="size-4" />
              </Button>
            ) : null}
            <SheetTitle className="min-w-0 truncate font-semibold text-base">
              {title}
            </SheetTitle>
          </div>
          <Button
            aria-label={t("agentDesk.drawer.close")}
            onClick={onClose}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <XIcon className="size-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
