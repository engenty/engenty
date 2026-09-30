"use client";

import type { AppBarPosition } from "@engenty/app-shell";
import { cn } from "@engenty/ui-core";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { COPILOT_Z_SNAP_HINT } from "./copilot-drawer-constants";
import { computePromptAnchor, PROMPT_INPUT_WIDTH } from "./copilot-fab-dial";
import type { CopilotRailSignal } from "./use-copilot-rail-signal";

/** How long a popout stays before it tucks back into the blob's dot. */
export const COPILOT_RAIL_POPOUT_MS = 8000;

/**
 * One line beside the blob when the closed copilot has something for the
 * person: a reply or a question. A click opens the copilot where it was; the
 * popout leaves on its own and the blob keeps its dot until the copilot opens.
 */
export function CopilotRailPopout({
  anchorRef,
  barSelector = '[data-engenty-region="app-bar"]',
  dismissLabel,
  docked,
  onOpen,
  position,
  signal,
  waitingLabel,
}: {
  anchorRef: { current: HTMLElement | null };
  barSelector?: string;
  dismissLabel: string;
  docked: boolean;
  onOpen: () => void;
  position: AppBarPosition;
  signal: CopilotRailSignal;
  /** Lead-in for a waiting question ("Waiting for you"). */
  waitingLabel: string;
}) {
  const popKey =
    signal.kind === "reply" || signal.kind === "waiting"
      ? `${signal.kind}:${signal.text}`
      : null;
  const [shownKey, setShownKey] = useState<string | null>(null);

  useEffect(() => {
    if (!popKey) {
      setShownKey(null);
      return;
    }
    setShownKey(popKey);
    const timer = window.setTimeout(
      () => setShownKey(null),
      COPILOT_RAIL_POPOUT_MS
    );
    return () => window.clearTimeout(timer);
  }, [popKey]);

  if (!(popKey && shownKey === popKey && typeof document !== "undefined")) {
    return null;
  }
  const fab = anchorRef.current?.getBoundingClientRect();
  if (!fab) {
    return null;
  }
  const bar = docked
    ? (anchorRef.current?.closest(barSelector)?.getBoundingClientRect() ?? null)
    : null;
  const anchor = computePromptAnchor({
    bar,
    dock: docked ? position : null,
    fab,
    viewport: { height: window.innerHeight, width: window.innerWidth },
  });
  const waiting = signal.kind === "waiting";
  const text = "text" in signal ? signal.text : "";

  return createPortal(
    <div
      className="fixed flex items-center gap-1 rounded-2xl border border-border-soft bg-card py-1.5 pr-1 pl-3 shadow-lg"
      style={{
        left: anchor.left,
        top: anchor.top,
        width: PROMPT_INPUT_WIDTH,
        zIndex: COPILOT_Z_SNAP_HINT + 7,
      }}
    >
      <button
        className="min-w-0 flex-1 text-left text-sm"
        onClick={() => {
          setShownKey(null);
          onOpen();
        }}
        type="button"
      >
        {waiting ? (
          <span className="block font-medium text-ember text-xs">
            {waitingLabel}
          </span>
        ) : null}
        <span className={cn("line-clamp-2", waiting && "text-foreground")}>
          {text || waitingLabel}
        </span>
      </button>
      <button
        aria-label={dismissLabel}
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
        onClick={() => setShownKey(null)}
        type="button"
      >
        <X aria-hidden className="size-3.5" />
      </button>
    </div>,
    document.body,
    "copilot-rail-popout"
  );
}
