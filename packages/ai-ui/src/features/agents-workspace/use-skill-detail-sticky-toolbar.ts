import type { CSSProperties, RefObject } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export interface SkillDetailStickyToolbarResult {
  pinned: boolean;
  placeholderHeight: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  sentinelRef: RefObject<HTMLDivElement | null>;
  toolbarRef: RefObject<HTMLDivElement | null>;
  toolbarStyle: CSSProperties | undefined;
}

/**
 * Pins the skill file / View·Code toolbar under the scroll viewport top using fixed
 * positioning (CSS sticky is unreliable in nested flex + overflow stacks).
 *
 * @param layoutKey — bump when toolbar DOM may mount late (e.g. skill load) so observers reattach.
 */
export function useSkillDetailStickyToolbar(
  layoutKey: string
): SkillDetailStickyToolbarResult {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const [pinned, setPinned] = useState(false);
  const [dockStyle, setDockStyle] = useState<CSSProperties | undefined>(
    undefined
  );
  const [placeholderHeight, setPlaceholderHeight] = useState(0);

  const update = useCallback(() => {
    const root = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!(root && sentinel)) {
      return;
    }

    const bar = toolbarRef.current;
    const rootRect = root.getBoundingClientRect();
    const sentRect = sentinel.getBoundingClientRect();
    const shouldPin = sentRect.top <= rootRect.top + 0.5;

    if (shouldPin) {
      if (!bar) {
        return;
      }
      setDockStyle({
        left: rootRect.left,
        position: "fixed",
        top: rootRect.top,
        width: rootRect.width,
        /** Above in-scroll content (e.g. syntax highlighter); pair with opaque pinned bg. */
        zIndex: 50,
      });
      setPlaceholderHeight(bar.offsetHeight);
      setPinned(true);
    } else {
      setDockStyle(undefined);
      setPlaceholderHeight(0);
      setPinned(false);
    }
  }, []);

  useLayoutEffect(() => {
    update();
  }, [update, layoutKey]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) {
      return;
    }

    root.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    const roRoot = new ResizeObserver(update);
    roRoot.observe(root);

    let roBar: ResizeObserver | null = null;
    const bar = toolbarRef.current;
    if (bar) {
      roBar = new ResizeObserver(update);
      roBar.observe(bar);
    }

    return () => {
      root.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      roRoot.disconnect();
      roBar?.disconnect();
    };
  }, [update, layoutKey]);

  return {
    placeholderHeight,
    pinned,
    scrollRef,
    sentinelRef,
    toolbarRef,
    toolbarStyle: pinned ? dockStyle : undefined,
  };
}
