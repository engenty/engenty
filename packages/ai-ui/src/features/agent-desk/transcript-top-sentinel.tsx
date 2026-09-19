// A strip at the top of the transcript that reports whether it is on screen.
//
// The desk header shrinks once the chat has scrolled. Reading `scrollTop`
// with two thresholds and a settle window fought the header's own height
// animation (every frame of the resize fired a scroll event). Watching a
// fixed-height element at the top of the scroller instead asks the browser
// the one question that matters — "is the beginning of the chat visible?" —
// and the header's size does not change the answer.
"use client";

import { useEffect, useRef } from "react";

/** Tall enough that a nudge does not flip it; short enough to be invisible. */
export const TRANSCRIPT_TOP_SENTINEL_PX = 48;

export function TranscriptTopSentinel({
  heightPx = TRANSCRIPT_TOP_SENTINEL_PX,
  onVisibilityChange,
}: {
  /**
   * How far the chat must scroll before "the beginning" counts as gone —
   * as tall as whatever the collapsed band is meant to replace, so the
   * band never covers half of it.
   */
  heightPx?: number;
  onVisibilityChange: (visible: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const callbackRef = useRef(onVisibilityChange);
  callbackRef.current = onVisibilityChange;

  useEffect(() => {
    const node = ref.current;
    if (!(node && typeof IntersectionObserver === "function")) {
      return;
    }
    // root null = the viewport, clipped by every scrolling ancestor — which
    // is exactly the transcript's scroller, without naming it.
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.at(-1);
        if (entry) {
          callbackRef.current(entry.isIntersecting);
        }
      },
      { threshold: 0 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none w-full shrink-0"
      data-testid="transcript-top-sentinel"
      ref={ref}
      style={{
        height: heightPx,
        marginBottom: -heightPx,
      }}
    />
  );
}
