"use client";

// The transcript sticks to its bottom until the person scrolls away, and
// every move it makes happens before the browser paints: a layout effect on
// open and on each change, the size observer's own callback when content
// grows. Deferring the scroll a frame or two — as this used to — painted the
// transcript at its top first and then jumped it down.
//
// Only the person unpins it. A scroll the page causes itself (rows drawn
// late, a block measured anew) says nothing about where the person wants to
// be; one right after their wheel, touch, key or pointer does. A kept desk
// (hidden, then shown again) comes back where it was left: at the bottom if
// it was pinned, at the same offset if not.

import { useLayoutEffect, useRef, useState } from "react";
import { COT_SUPPRESS_AUTOSCROLL_ATTR } from "../../ai-elements/chain-of-thought";
import {
  getCopilotTranscriptScrollTop,
  isCopilotScrollViewportNearBottom,
} from "./copilot-panel-scroll-utils";

/** How long after an input a scroll still counts as the person's. */
const USER_SCROLL_INTENT_MS = 1000;

function viewportOf(root: HTMLElement | null): HTMLElement | null {
  return (
    root?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]') ??
    null
  );
}

export function useCopilotPanelTranscriptScroll(input: {
  autoScrollKey?: string | number | null;
  draft: string;
  messages: readonly { id: string }[];
  pendingUserParts?: readonly unknown[] | null;
  pendingUserText?: string | null;
  showTranscriptLoading: boolean;
  status: "ready" | "streaming" | "submitted" | "error";
}) {
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const [showTranscriptTopFade, setShowTranscriptTopFade] = useState(false);
  const pinnedRef = useRef(true);
  /** Where the person left it, for a desk shown again. */
  const savedScrollTopRef = useRef<number | null>(null);
  const lastStatusRef = useRef(input.status);
  const lastAutoScrollKeyRef = useRef(input.autoScrollKey);
  // What moves the bottom: the newest message (a new object whenever its
  // content changes — unchanged messages keep theirs), the count, the
  // pending turn. Compared by identity.
  const lastMessage = input.messages.at(-1) ?? null;
  const messageCount = input.messages.length;
  const pendingUserText = input.pendingUserText?.trim() || null;
  const pendingPartCount = input.pendingUserParts?.length ?? 0;

  const pinToBottom = (viewport: HTMLElement) => {
    if (viewport.hasAttribute(COT_SUPPRESS_AUTOSCROLL_ATTR)) {
      return;
    }
    const top = getCopilotTranscriptScrollTop(viewport);
    if (Math.abs(viewport.scrollTop - top) > 1) {
      viewport.scrollTop = top;
    }
  };

  // A new conversation, the transcript arriving, or the person sending: back
  // to the bottom.
  if (lastAutoScrollKeyRef.current !== input.autoScrollKey) {
    lastAutoScrollKeyRef.current = input.autoScrollKey;
    pinnedRef.current = true;
  }
  if (
    lastStatusRef.current !== input.status &&
    lastStatusRef.current === "ready" &&
    (input.status === "submitted" || input.status === "streaming")
  ) {
    pinnedRef.current = true;
  }
  lastStatusRef.current = input.status;

  // Listeners, and the position a shown-again desk returns to. Runs on mount
  // and each time a hidden desk is shown (its effects run again then).
  useLayoutEffect(() => {
    const root = scrollAreaRef.current;
    const viewport = viewportOf(root);
    if (!(root && viewport)) {
      return;
    }
    if (pinnedRef.current) {
      pinToBottom(viewport);
    } else if (savedScrollTopRef.current !== null) {
      viewport.scrollTop = savedScrollTopRef.current;
    }
    setShowTranscriptTopFade(viewport.scrollTop > 2);

    let intentAt = 0;
    let lastTop = viewport.scrollTop;
    const markIntent = () => {
      intentAt = performance.now();
    };
    const onScroll = () => {
      const top = viewport.scrollTop;
      const byPerson = performance.now() - intentAt < USER_SCROLL_INTENT_MS;
      savedScrollTopRef.current = top;
      setShowTranscriptTopFade(top > 2);
      if (byPerson && top < lastTop - 1) {
        // Scrolling up is leaving the bottom, however close to it.
        pinnedRef.current = false;
      } else if (isCopilotScrollViewportNearBottom(viewport)) {
        pinnedRef.current = true;
      } else if (byPerson) {
        pinnedRef.current = false;
      }
      lastTop = top;
    };
    // The viewport's size and its content's height move the bottom. The
    // observer's callback runs after layout and before paint, so pinning
    // here never shows the unpinned frame.
    const ro = new ResizeObserver(() => {
      if (pinnedRef.current) {
        pinToBottom(viewport);
      }
      setShowTranscriptTopFade(viewport.scrollTop > 2);
    });
    ro.observe(viewport);
    const content = viewport.firstElementChild;
    if (content) {
      ro.observe(content);
    }
    const intentEvents = [
      "wheel",
      "touchstart",
      "touchmove",
      "keydown",
      "pointerdown",
    ] as const;
    for (const type of intentEvents) {
      root.addEventListener(type, markIntent, { passive: true });
    }
    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      ro.disconnect();
      for (const type of intentEvents) {
        root.removeEventListener(type, markIntent);
      }
      viewport.removeEventListener("scroll", onScroll);
    };
    // Re-attached when the loading skeleton gives way to the transcript: the
    // viewport's content element is a different one then.
  }, [input.showTranscriptLoading]);

  // Every change that can move the bottom, pinned before paint.
  useLayoutEffect(() => {
    if (!pinnedRef.current) {
      return;
    }
    const viewport = viewportOf(scrollAreaRef.current);
    if (viewport) {
      pinToBottom(viewport);
    }
  }, [
    input.autoScrollKey,
    input.draft,
    input.showTranscriptLoading,
    input.status,
    lastMessage,
    messageCount,
    pendingPartCount,
    pendingUserText,
  ]);

  return { scrollAreaRef, showTranscriptTopFade };
}
