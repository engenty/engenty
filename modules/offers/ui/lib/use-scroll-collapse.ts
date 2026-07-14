import { useCallback, useRef, useState } from "react";

/**
 * Collapses a pinned document header once its scroll container has scrolled
 * past `threshold`. The header sits outside the scroll container, so
 * collapsing it never changes the scroll position — a single threshold is
 * flicker-free (no feedback loop). Attach `scrollRef` + `onScroll` to the
 * scrollable element and drive the header's `collapsed` prop from `collapsed`.
 */
export function useScrollCollapse(threshold = 12) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const next = el.scrollTop > threshold;
    setCollapsed((prev) => (prev === next ? prev : next));
  }, [threshold]);
  return { collapsed, onScroll, scrollRef };
}
