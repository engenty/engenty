import { useEffect, useState } from "react";

/** Suppress width transitions while the window is resizing so flex/layout does not animate. */
export function useSuppressPaneWidthTransition() {
  const [suppressPaneWidthTransition, setSuppressPaneWidthTransition] =
    useState(false);

  useEffect(() => {
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      if (idleTimer === null) {
        setSuppressPaneWidthTransition(true);
      } else {
        clearTimeout(idleTimer);
      }
      idleTimer = setTimeout(() => {
        setSuppressPaneWidthTransition(false);
        idleTimer = null;
      }, 120);
    };
    window.addEventListener("resize", onResize, { passive: true });
    return () => {
      window.removeEventListener("resize", onResize);
      if (idleTimer) {
        clearTimeout(idleTimer);
      }
    };
  }, []);

  return suppressPaneWidthTransition;
}
