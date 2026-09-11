"use client";

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import { useArtifacts } from "../../../artifacts/artifact-store.js";
import { ThreadContextBox } from "./thread-context-box.js";
import {
  setThreadContextMode,
  setThreadContextOverlayOpen,
} from "./thread-context-store.js";
import {
  THREAD_CONTEXT_FLOAT_GAP_PX,
  THREAD_CONTEXT_FLOAT_RESERVE_PX,
  THREAD_CONTEXT_FLOAT_WIDTH_PX,
  THREAD_CONTEXT_INLINE_MIN_WIDTH_PX,
  THREAD_CONTEXT_INLINE_PAD_VAR,
} from "./thread-context-types.js";
import { useThreadContextSummary } from "./use-thread-context-summary.js";

function readTopbarOverlapPadPx(): number {
  if (typeof document === "undefined") {
    return THREAD_CONTEXT_FLOAT_GAP_PX;
  }
  const topbar = document.querySelector<HTMLElement>(
    "[data-engenty-region='topbar'][data-topbar-overlap='true']"
  );
  if (!topbar) {
    return THREAD_CONTEXT_FLOAT_GAP_PX;
  }
  return topbar.offsetHeight + THREAD_CONTEXT_FLOAT_GAP_PX;
}

/**
 * Floating thread-context card over the chat surface — not a sidebar column.
 * When space allows (and the artifact pane is closed), the card pins top-right
 * and sets {@link THREAD_CONTEXT_INLINE_PAD_VAR} so inner chat content pads
 * right (full-bleed background, no reserved lane). Otherwise the same content
 * lives behind the topbar Layers / ⋯ menu.
 *
 * Wrap the chat column as children.
 */
export function ThreadContextPane({
  children,
  hostKey,
}: {
  children: ReactNode;
  hostKey: string;
}) {
  const summary = useThreadContextSummary(hostKey);
  const { paneOpen } = useArtifacts(hostKey);
  const [enoughWidth, setEnoughWidth] = useState(true);
  const [overlapPadPx, setOverlapPadPx] = useState(THREAD_CONTEXT_FLOAT_GAP_PX);

  useLayoutEffect(() => {
    const element =
      typeof document === "undefined"
        ? null
        : document.querySelector<HTMLElement>("[data-engenty-content-stack]");
    const updatePad = () => setOverlapPadPx(readTopbarOverlapPadPx());

    if (!element) {
      const updateFromViewport = () => {
        setEnoughWidth(window.innerWidth >= THREAD_CONTEXT_INLINE_MIN_WIDTH_PX);
        updatePad();
      };
      updateFromViewport();
      window.addEventListener("resize", updateFromViewport);
      return () => window.removeEventListener("resize", updateFromViewport);
    }

    const update = () => {
      const width = element.offsetWidth;
      if (width === 0) {
        return;
      }
      setEnoughWidth(width >= THREAD_CONTEXT_INLINE_MIN_WIDTH_PX);
      updatePad();
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const showFloating = !(summary.isEmpty || paneOpen) && enoughWidth;

  useEffect(() => {
    if (summary.isEmpty) {
      setThreadContextMode("hidden");
      return;
    }
    setThreadContextMode(showFloating ? "inline" : "collapsed");
  }, [summary.isEmpty, showFloating]);

  useEffect(() => {
    if (paneOpen) {
      setThreadContextOverlayOpen(false);
    }
  }, [paneOpen]);

  useEffect(
    () => () => {
      setThreadContextMode("hidden");
    },
    []
  );

  const rootStyle = showFloating
    ? ({
        [THREAD_CONTEXT_INLINE_PAD_VAR]: `${THREAD_CONTEXT_FLOAT_RESERVE_PX}px`,
      } as CSSProperties)
    : undefined;

  return (
    <div
      className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-transparent"
      style={rootStyle}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
      {showFloating ? (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-10 flex justify-end pr-3 pb-3"
          style={{
            paddingTop: overlapPadPx,
            width: THREAD_CONTEXT_FLOAT_RESERVE_PX,
          }}
        >
          <div
            className="pointer-events-auto sticky max-h-full self-start overflow-y-auto"
            style={{ top: overlapPadPx, width: THREAD_CONTEXT_FLOAT_WIDTH_PX }}
          >
            <ThreadContextBox hostKey={hostKey} summary={summary} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
