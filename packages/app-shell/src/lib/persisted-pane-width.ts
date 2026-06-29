export function clampPaneWidthPx(
  px: number,
  minPx: number,
  maxPx: number,
  fallbackPx: number
): number {
  const base = Number.isFinite(px) ? px : fallbackPx;
  return Math.max(minPx, Math.min(maxPx, Math.round(base)));
}

export function readInitialPaneWidthPx(
  storageKey: string,
  minPx: number,
  maxPx: number,
  fallbackPx: number
): number {
  if (typeof window === "undefined") {
    return fallbackPx;
  }
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null || raw === "") {
      return fallbackPx;
    }
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n)) {
      return fallbackPx;
    }
    return clampPaneWidthPx(n, minPx, maxPx, fallbackPx);
  } catch {
    return fallbackPx;
  }
}

export function persistPaneWidthPx(
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
      storageKey,
      String(clampPaneWidthPx(widthPx, minPx, maxPx, fallbackPx))
    );
  } catch {
    /* ignore quota / private mode */
  }
}
