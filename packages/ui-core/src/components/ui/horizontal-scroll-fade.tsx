"use client";

import type * as React from "react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";

export interface HorizontalScrollFadeProps {
  children: React.ReactNode;
  className?: string;
  /** Tailwind `from-*` stop for edge gradients (e.g. `from-muted/30` on tinted headers). */
  fadeFromClassName?: string;
  /** Width of each fade (Tailwind width class). */
  fadeWidthClassName?: string;
  /** Classes on the horizontal scrollport (overflow is applied here). */
  scrollClassName?: string;
}

/**
 * Horizontal overflow with hidden scrollbars and optional left/right fades when
 * content is scrollable in that direction.
 */
export function HorizontalScrollFade({
  children,
  className,
  fadeFromClassName = "from-background",
  fadeWidthClassName = "w-8",
  scrollClassName,
}: HorizontalScrollFadeProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const updateEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const maxScroll = Math.max(0, scrollWidth - clientWidth);
    const epsilon = 2;
    setEdges({
      left: scrollLeft > epsilon,
      right: scrollLeft < maxScroll - epsilon,
    });
  }, []);

  useLayoutEffect(() => {
    updateEdges();
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const ro = new ResizeObserver(() => {
      updateEdges();
    });
    ro.observe(el);
    const mo = new MutationObserver(() => {
      updateEdges();
    });
    mo.observe(el, { childList: true, subtree: true });
    el.addEventListener("scroll", updateEdges, { passive: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
      el.removeEventListener("scroll", updateEdges);
    };
  }, [updateEdges]);

  return (
    <div className={cn("relative min-w-0", className)}>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 z-10 bg-gradient-to-r to-transparent transition-opacity duration-200",
          fadeWidthClassName,
          fadeFromClassName,
          edges.left ? "opacity-100" : "opacity-0"
        )}
      />
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 z-10 bg-gradient-to-l to-transparent transition-opacity duration-200",
          fadeWidthClassName,
          fadeFromClassName,
          edges.right ? "opacity-100" : "opacity-0"
        )}
      />
      <div
        className={cn(
          "min-w-0 overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
          scrollClassName
        )}
        ref={scrollRef}
      >
        {children}
      </div>
    </div>
  );
}
