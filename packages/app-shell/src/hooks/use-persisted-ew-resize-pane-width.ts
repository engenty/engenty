import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  clampPaneWidthPx,
  persistPaneWidthPx,
  readInitialPaneWidthPx,
} from "../lib/persisted-pane-width";

const RESIZE_STEP_PX = 16;

export interface PersistedEwResizePaneWidthOptions {
  defaultPx: number;
  /** Flip drag/arrow direction for panes on the trailing (right) edge. */
  invert?: boolean;
  maxPx: number;
  minPx: number;
  storageKey: string;
}

export function usePersistedEwResizePaneWidth({
  storageKey,
  defaultPx,
  invert = false,
  minPx,
  maxPx,
}: PersistedEwResizePaneWidthOptions) {
  const [widthPx, setWidthPxState] = useState(() => defaultPx);

  useLayoutEffect(() => {
    setWidthPxState(
      readInitialPaneWidthPx(storageKey, minPx, maxPx, defaultPx)
    );
  }, [defaultPx, maxPx, minPx, storageKey]);

  const [resizePreviewPx, setResizePreviewPx] = useState<number | null>(null);
  const resizeSessionRef = useRef<{
    startWidth: number;
    startX: number;
  } | null>(null);
  const latestWidthRef = useRef(widthPx);

  useEffect(() => {
    latestWidthRef.current = widthPx;
  }, [widthPx]);

  const clamp = useCallback(
    (px: number) => clampPaneWidthPx(px, minPx, maxPx, defaultPx),
    [defaultPx, maxPx, minPx]
  );

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const session = resizeSessionRef.current;
      if (!session) {
        return;
      }
      const deltaX = event.clientX - session.startX;
      const next = clamp(session.startWidth + (invert ? -deltaX : deltaX));
      latestWidthRef.current = next;
      setResizePreviewPx(next);
    };

    const handlePointerUp = () => {
      const session = resizeSessionRef.current;
      resizeSessionRef.current = null;
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
      if (session) {
        const finalWidth = latestWidthRef.current;
        setWidthPxState(finalWidth);
        setResizePreviewPx(null);
        persistPaneWidthPx(storageKey, finalWidth, minPx, maxPx, defaultPx);
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [clamp, defaultPx, invert, maxPx, minPx, storageKey]);

  const handleResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const startWidth = resizePreviewPx ?? widthPx;
      resizeSessionRef.current = {
        startWidth,
        startX: event.clientX,
      };
      latestWidthRef.current = startWidth;
      document.body.style.setProperty("cursor", "ew-resize");
      document.body.style.setProperty("user-select", "none");
    },
    [resizePreviewPx, widthPx]
  );

  const handleResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      const step = invert ? -RESIZE_STEP_PX : RESIZE_STEP_PX;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setWidthPxState((current) => {
          const next = clamp(current - step);
          persistPaneWidthPx(storageKey, next, minPx, maxPx, defaultPx);
          return next;
        });
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setWidthPxState((current) => {
          const next = clamp(current + step);
          persistPaneWidthPx(storageKey, next, minPx, maxPx, defaultPx);
          return next;
        });
      }
    },
    [clamp, defaultPx, invert, maxPx, minPx, storageKey]
  );

  const displayedWidthPx = resizePreviewPx ?? widthPx;
  const isResizing = resizePreviewPx !== null;

  return {
    displayedWidthPx,
    handleResizeKeyDown,
    handleResizePointerDown,
    isResizing,
    widthPx,
  };
}
