"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { cn } from "../../../lib/utils";

const ELLIPSIS = "\u2026";

function fitMiddleEllipsis(text: string, el: HTMLElement): string {
  const maxW = el.clientWidth;
  if (maxW <= 0 || text.length === 0) {
    return text;
  }

  el.textContent = text;
  if (el.scrollWidth <= maxW) {
    return text;
  }

  const n = text.length;
  el.textContent = ELLIPSIS;
  if (el.scrollWidth > maxW) {
    return "";
  }

  let lo = 0;
  let hi = n;
  let best = ELLIPSIS;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const left = Math.ceil(mid / 2);
    const right = Math.floor(mid / 2);
    /* Prefix + suffix must not overlap; result length is left + 1 + right ≤ n. */
    if (left + right > n - 1) {
      hi = mid - 1;
      continue;
    }
    const candidate =
      left === 0 && right === 0
        ? ELLIPSIS
        : text.slice(0, left) + ELLIPSIS + text.slice(n - right);

    el.textContent = candidate;
    if (el.scrollWidth <= maxW) {
      best = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return best;
}

export type ShellBreadcrumbPlainTextMode = "end" | "middle";

/** Single-line breadcrumb label: end ellipsis via CSS, or measured middle ellipsis. */
export function ShellBreadcrumbPlainText({
  text,
  mode,
  className,
  /** HTML `title` (e.g. full label when `text` is shortened elsewhere). Defaults to `text`. */
  nativeTitle,
}: {
  text: string;
  mode: ShellBreadcrumbPlainTextMode;
  className?: string;
  nativeTitle?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(text);

  useLayoutEffect(() => {
    if (mode === "end") {
      setDisplay(text);
      return;
    }

    const el = ref.current;
    if (!el) {
      return;
    }

    const run = () => {
      setDisplay(fitMiddleEllipsis(text, el));
    };

    run();
    const ro = new ResizeObserver(run);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, mode]);

  const titleAttr = nativeTitle ?? text;

  if (mode === "end") {
    return (
      <span
        className={cn("block min-w-0 truncate whitespace-nowrap", className)}
        title={titleAttr}
      >
        {text}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "block w-full min-w-0 overflow-hidden whitespace-nowrap",
        className
      )}
      ref={ref}
      title={titleAttr}
    >
      {display}
    </span>
  );
}
