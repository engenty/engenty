"use client";

import { useEffect, useRef, useState } from "react";
import { COT_SUPPRESS_AUTOSCROLL_ATTR } from "../../ai-elements/chain-of-thought";
import type { CopilotPanelContentProps } from "./copilot-panel-content-types";
import {
  buildCopilotAutoScrollSignature,
  getCopilotTranscriptScrollTop,
  isCopilotScrollViewportNearBottom,
} from "./copilot-panel-scroll-utils";

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
  const shouldAutoScrollRef = useRef(true);
  const lastStatusRef = useRef(input.status);
  const lastShowTranscriptLoadingRef = useRef(input.showTranscriptLoading);
  const lastAutoScrollKeyRef = useRef<string | number | null | undefined>(
    input.autoScrollKey
  );
  const autoScrollSignature = buildCopilotAutoScrollSignature(
    input.messages as CopilotPanelContentProps["messages"],
    input.pendingUserText,
    input.pendingUserParts
  );

  useEffect(() => {
    if (lastAutoScrollKeyRef.current === input.autoScrollKey) {
      return;
    }
    lastAutoScrollKeyRef.current = input.autoScrollKey;
    shouldAutoScrollRef.current = true;
  }, [input.autoScrollKey]);

  useEffect(() => {
    const wasLoading = lastShowTranscriptLoadingRef.current;
    lastShowTranscriptLoadingRef.current = input.showTranscriptLoading;
    if (!(wasLoading && !input.showTranscriptLoading)) {
      return;
    }
    shouldAutoScrollRef.current = true;
    const root = scrollAreaRef.current;
    if (!root) {
      return;
    }
    const viewport = root.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]'
    );
    if (!viewport) {
      return;
    }
    const run = () => {
      viewport.scrollTo({
        behavior: "auto",
        top: getCopilotTranscriptScrollTop(viewport),
      });
    };
    const raf = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(run);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [input.showTranscriptLoading]);

  useEffect(() => {
    const previous = lastStatusRef.current;
    lastStatusRef.current = input.status;
    if (
      previous === "ready" &&
      (input.status === "submitted" || input.status === "streaming")
    ) {
      shouldAutoScrollRef.current = true;
    }
  }, [input.status]);

  useEffect(() => {
    const root = scrollAreaRef.current;
    if (!root) {
      return;
    }
    const viewport = root.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]'
    );
    if (!viewport) {
      return;
    }
    const updateScrollStateFromUserScroll = () => {
      shouldAutoScrollRef.current = isCopilotScrollViewportNearBottom(viewport);
      setShowTranscriptTopFade(viewport.scrollTop > 2);
    };
    const updateChromeOnly = () => {
      setShowTranscriptTopFade(viewport.scrollTop > 2);
    };
    const scrollTranscriptToBottom = () => {
      viewport.scrollTo({
        behavior: "auto",
        top: getCopilotTranscriptScrollTop(viewport),
      });
    };
    const handleViewportContentChange = () => {
      updateChromeOnly();
      if (viewport.hasAttribute(COT_SUPPRESS_AUTOSCROLL_ATTR)) {
        return;
      }
      if (!shouldAutoScrollRef.current) {
        return;
      }
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(scrollTranscriptToBottom);
      });
    };
    updateChromeOnly();
    viewport.addEventListener("scroll", updateScrollStateFromUserScroll, {
      passive: true,
    });
    const ro = new ResizeObserver(handleViewportContentChange);
    ro.observe(viewport);
    const mo = new MutationObserver(handleViewportContentChange);
    mo.observe(viewport, { childList: true, subtree: true });
    return () => {
      viewport.removeEventListener("scroll", updateScrollStateFromUserScroll);
      ro.disconnect();
      mo.disconnect();
    };
  }, [input.showTranscriptLoading]);

  useEffect(() => {
    if (!shouldAutoScrollRef.current) {
      return;
    }
    const root = scrollAreaRef.current;
    if (!root) {
      return;
    }
    const viewport = root.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]'
    );
    if (!viewport) {
      return;
    }
    const run = () => {
      viewport.scrollTo({
        behavior: "auto",
        top: getCopilotTranscriptScrollTop(viewport),
      });
    };
    const raf = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(run);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [autoScrollSignature, input.draft, input.status]);

  return { scrollAreaRef, showTranscriptTopFade };
}
