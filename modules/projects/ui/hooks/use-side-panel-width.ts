import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useState,
} from "react";

const DEFAULT_MIN_WIDTH = 360;

export interface UseSidePanelWidthOptions {
  defaultWidth: number;
  minWidth?: number;
  storageKey: string;
}

/** Drag-to-resize width for a right-anchored side panel, persisted in localStorage. */
export function useSidePanelWidth({
  storageKey,
  defaultWidth,
  minWidth = DEFAULT_MIN_WIDTH,
}: UseSidePanelWidthOptions) {
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === "undefined") {
      return defaultWidth;
    }
    const saved = Number(window.localStorage.getItem(storageKey));
    return Number.isFinite(saved) && saved >= minWidth ? saved : defaultWidth;
  });

  const startResize = useCallback(
    (e: ReactPointerEvent) => {
      e.preventDefault();
      const onMove = (ev: PointerEvent) => {
        const max = Math.round(window.innerWidth * 0.95);
        // Panel is anchored right: width grows as the pointer moves left.
        const next = Math.min(
          max,
          Math.max(minWidth, window.innerWidth - ev.clientX)
        );
        setWidth(next);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        document.body.style.userSelect = "";
        setWidth((w) => {
          window.localStorage.setItem(storageKey, String(w));
          return w;
        });
      };
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [minWidth, storageKey]
  );

  return { width, startResize };
}
