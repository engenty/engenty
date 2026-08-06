import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const RESIZE_STEP_PX = 16;
const WIDTH_STORAGE_SUFFIX = ":width";

function clampWidth(
  px: number,
  minPx: number,
  maxPx: number,
  fallbackPx: number
): number {
  const base = Number.isFinite(px) ? px : fallbackPx;
  return Math.max(minPx, Math.min(maxPx, Math.round(base)));
}

function readStoredWidth(
  storageKey: string,
  minPx: number,
  maxPx: number,
  fallbackPx: number
): number {
  if (typeof window === "undefined") {
    return fallbackPx;
  }
  try {
    const raw = window.localStorage.getItem(storageKey + WIDTH_STORAGE_SUFFIX);
    if (raw === null || raw === "") {
      return fallbackPx;
    }
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n)) {
      return fallbackPx;
    }
    return clampWidth(n, minPx, maxPx, fallbackPx);
  } catch {
    return fallbackPx;
  }
}

function persistWidth(
  storageKey: string,
  widthPx: number,
  minPx: number,
  maxPx: number,
  fallbackPx: number
): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      storageKey + WIDTH_STORAGE_SUFFIX,
      String(clampWidth(widthPx, minPx, maxPx, fallbackPx))
    );
  } catch {
    // Persistence is best-effort.
  }
}

export interface UseDocSidebarWidthOptions {
  defaultPx: number;
  maxPx: number;
  minPx: number;
  storageKey: string;
}

/**
 * Drag/keyboard width for a right-edge doc sidebar. Width grows as the
 * pointer moves left (`invert`). Persists under `${storageKey}:width`.
 */
export function useDocSidebarWidth({
  storageKey,
  defaultPx,
  minPx,
  maxPx,
}: UseDocSidebarWidthOptions) {
  const [widthPx, setWidthPxState] = useState(() => defaultPx);
  const [resizePreviewPx, setResizePreviewPx] = useState<number | null>(null);
  const resizeSessionRef = useRef<{
    startWidth: number;
    startX: number;
  } | null>(null);
  const latestWidthRef = useRef(widthPx);

  useLayoutEffect(() => {
    setWidthPxState(readStoredWidth(storageKey, minPx, maxPx, defaultPx));
  }, [defaultPx, maxPx, minPx, storageKey]);

  useEffect(() => {
    latestWidthRef.current = widthPx;
  }, [widthPx]);

  const clamp = useCallback(
    (px: number) => clampWidth(px, minPx, maxPx, defaultPx),
    [defaultPx, maxPx, minPx]
  );

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const session = resizeSessionRef.current;
      if (!session) {
        return;
      }
      // Right-edge pane: drag left → wider.
      const next = clamp(session.startWidth - (event.clientX - session.startX));
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
        persistWidth(storageKey, finalWidth, minPx, maxPx, defaultPx);
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [clamp, defaultPx, maxPx, minPx, storageKey]);

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
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setWidthPxState((current) => {
          const next = clamp(current + RESIZE_STEP_PX);
          persistWidth(storageKey, next, minPx, maxPx, defaultPx);
          return next;
        });
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setWidthPxState((current) => {
          const next = clamp(current - RESIZE_STEP_PX);
          persistWidth(storageKey, next, minPx, maxPx, defaultPx);
          return next;
        });
      }
    },
    [clamp, defaultPx, maxPx, minPx, storageKey]
  );

  return {
    displayedWidthPx: resizePreviewPx ?? widthPx,
    handleResizeKeyDown,
    handleResizePointerDown,
    isResizing: resizePreviewPx !== null,
  };
}
