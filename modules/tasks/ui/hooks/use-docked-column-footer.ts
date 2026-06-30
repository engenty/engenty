import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export interface UseDockedColumnFooterOptions {
  anchorRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  scrollRootRef: RefObject<HTMLElement | null>;
}

export interface DockedColumnFooterState {
  columnRef: RefObject<HTMLDivElement | null>;
  composerHeight: number;
  docked: boolean;
  dockStyle: React.CSSProperties;
  footerRef: RefObject<HTMLDivElement | null>;
  sentinelRef: RefObject<HTMLDivElement | null>;
}

function isSentinelVisibleInScrollRoot(
  sentinel: HTMLElement,
  scrollRoot: HTMLElement
): boolean {
  const sentinelRect = sentinel.getBoundingClientRect();
  const scrollRect = scrollRoot.getBoundingClientRect();
  return (
    sentinelRect.top < scrollRect.bottom - 4 &&
    sentinelRect.bottom > scrollRect.top + 4
  );
}

/** Docks a footer to the main shell bottom until its in-flow sentinel is visible. */
export function useDockedColumnFooter({
  enabled,
  scrollRootRef,
  anchorRef,
}: UseDockedColumnFooterOptions): DockedColumnFooterState {
  const columnRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const [docked, setDocked] = useState(false);
  const [composerHeight, setComposerHeight] = useState(0);
  const [dockStyle, setDockStyle] = useState<React.CSSProperties>({});

  const measureFooter = useCallback(() => {
    const footer = footerRef.current;
    if (!footer) {
      return 0;
    }
    const height = footer.offsetHeight;
    setComposerHeight(height);
    return height;
  }, []);

  const updateDockState = useCallback(() => {
    if (!enabled) {
      setDocked(false);
      return;
    }

    const column = columnRef.current;
    const sentinel = sentinelRef.current;
    const scrollRoot = scrollRootRef.current;
    const anchor = anchorRef.current;
    if (!(column && sentinel && scrollRoot && anchor)) {
      return;
    }

    measureFooter();

    const columnRect = column.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const nextDocked = !isSentinelVisibleInScrollRoot(sentinel, scrollRoot);

    setDocked(nextDocked);
    setDockStyle({
      bottom: 0,
      left: columnRect.left - anchorRect.left,
      position: "absolute",
      width: columnRect.width,
    });
  }, [anchorRef, enabled, measureFooter, scrollRootRef]);

  useLayoutEffect(() => {
    updateDockState();
  }, [updateDockState, docked]);

  useEffect(() => {
    const footer = footerRef.current;
    if (!footer) {
      return;
    }
    const observer = new ResizeObserver(() => {
      updateDockState();
    });
    observer.observe(footer);
    return () => observer.disconnect();
  }, [updateDockState, docked]);

  useEffect(() => {
    if (!enabled) {
      setDocked(false);
      return;
    }

    const sentinel = sentinelRef.current;
    const scrollRoot = scrollRootRef.current;
    if (!(sentinel && scrollRoot)) {
      return;
    }

    const observer = new IntersectionObserver(
      () => {
        updateDockState();
      },
      { root: scrollRoot, rootMargin: "0px", threshold: 0 }
    );
    observer.observe(sentinel);

    const onLayout = () => {
      updateDockState();
    };

    window.addEventListener("resize", onLayout);
    window.addEventListener("scroll", onLayout, { passive: true });
    scrollRoot.addEventListener("scroll", onLayout, { passive: true });
    onLayout();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onLayout);
      window.removeEventListener("scroll", onLayout);
      scrollRoot.removeEventListener("scroll", onLayout);
    };
  }, [enabled, scrollRootRef, updateDockState]);

  return {
    columnRef,
    composerHeight,
    docked,
    dockStyle,
    footerRef,
    sentinelRef,
  };
}
