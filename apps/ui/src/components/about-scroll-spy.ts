import { type RefObject, useCallback, useEffect, useRef } from "react";

/** Sticky section title band inside About dialogs (`py-2.5` + text-base). */
const STICKY_PROBE_OFFSET_PX = 52;

/**
 * Scrollspy for sticky-header section lists. Uses scroll position (last section
 * whose top is above the sticky band) instead of IntersectionObserver — IO
 * drifts one section behind with sticky titles.
 */
export function useAboutSectionScrollSpy({
  open,
  contentRef,
  sectionAttr,
  onActiveChange,
  resetKey,
}: {
  contentRef: RefObject<HTMLElement | null>;
  onActiveChange: (key: string) => void;
  open: boolean;
  /** Re-bind when the section list changes (filtered releases, etc.). */
  resetKey: unknown;
  sectionAttr: string;
}): {
  beginProgrammaticScroll: () => void;
} {
  const suppressUntilRef = useRef(0);
  const onActiveChangeRef = useRef(onActiveChange);
  onActiveChangeRef.current = onActiveChange;

  const beginProgrammaticScroll = useCallback(() => {
    // Ignore scroll events while smooth scrollTo settles.
    suppressUntilRef.current = Date.now() + 500;
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const root = contentRef.current;
    if (!root) {
      return;
    }

    const sync = () => {
      if (Date.now() < suppressUntilRef.current) {
        return;
      }
      const sections = [
        ...root.querySelectorAll<HTMLElement>(`[${sectionAttr}]`),
      ];
      if (sections.length === 0) {
        return;
      }

      const probeY = root.getBoundingClientRect().top + STICKY_PROBE_OFFSET_PX;
      let current = sections[0];
      for (const section of sections) {
        if (section.getBoundingClientRect().top <= probeY) {
          current = section;
        } else {
          break;
        }
      }

      const key = current?.getAttribute(sectionAttr);
      if (key) {
        onActiveChangeRef.current(key);
      }
    };

    root.addEventListener("scroll", sync, { passive: true });
    sync();
    return () => root.removeEventListener("scroll", sync);
  }, [open, contentRef, sectionAttr, resetKey]);

  return { beginProgrammaticScroll };
}
