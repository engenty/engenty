// Whether a scroll container has moved off its top.
//
// The workflow pages float a transparent topbar over their header
// (`topbarOverlap`). That only reads as one surface while the page is at the
// top: once it scrolls, the header has to stay put and collapse, or the title
// slides up behind the breadcrumb row and the two overlap.
import { useCallback, useState } from "react";

/** Past this many pixels the header counts as stuck. */
const THRESHOLD_PX = 16;

export function useScrolledPast(): {
  onScroll: (event: { currentTarget: HTMLElement }) => void;
  scrolled: boolean;
} {
  const [scrolled, setScrolled] = useState(false);
  const onScroll = useCallback((event: { currentTarget: HTMLElement }) => {
    setScrolled(event.currentTarget.scrollTop > THRESHOLD_PX);
  }, []);
  return { onScroll, scrolled };
}
