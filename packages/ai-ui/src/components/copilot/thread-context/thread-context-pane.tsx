"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { useArtifacts } from "../../../artifacts/artifact-store.js";
import { ThreadContextBox } from "./thread-context-box.js";
import {
  setThreadContextMode,
  setThreadContextOverlayOpen,
} from "./thread-context-store.js";
import {
  THREAD_CONTEXT_FLOAT_GAP_PX,
  THREAD_CONTEXT_FLOAT_WIDTH_PX,
  THREAD_CONTEXT_INLINE_MIN_WIDTH_PX,
} from "./thread-context-types.js";
import { useThreadContextSummary } from "./use-thread-context-summary.js";

/**
 * Full-page thread context card as a sticky flex sibling of the chat column —
 * the thread shrinks to clear the box (no overlay). When the artifact pane is
 * open or the content stack is too narrow, collapses behind the topbar icon.
 *
 * Mount as a flex sibling of the chat column inside a horizontal flex row.
 */
export function ThreadContextPane({ hostKey }: { hostKey: string }) {
  const summary = useThreadContextSummary(hostKey);
  const { paneOpen } = useArtifacts(hostKey);
  const [enoughWidth, setEnoughWidth] = useState(true);

  useLayoutEffect(() => {
    const element =
      typeof document === "undefined"
        ? null
        : document.querySelector<HTMLElement>("[data-engenty-content-stack]");

    if (!element) {
      const updateFromViewport = () => {
        setEnoughWidth(window.innerWidth >= THREAD_CONTEXT_INLINE_MIN_WIDTH_PX);
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

  if (summary.isEmpty || !showFloating) {
    return null;
  }

  return (
    <div
      className="sticky top-0 z-20 flex max-h-full shrink-0 flex-col self-start overflow-y-auto pt-3 pr-3 pb-3"
      style={{
        width: THREAD_CONTEXT_FLOAT_WIDTH_PX + THREAD_CONTEXT_FLOAT_GAP_PX,
        paddingLeft: THREAD_CONTEXT_FLOAT_GAP_PX,
      }}
    >
      <ThreadContextBox hostKey={hostKey} summary={summary} />
    </div>
  );
}
