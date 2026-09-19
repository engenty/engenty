import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  APP_BAR_EXTENDED_MEDIA_QUERY,
  type AppBarPosition,
  appBarThicknessPx,
  DEFAULT_APP_BAR_POSITION,
  isHorizontalAppBarPosition,
  readAppBarPositionFromStorage,
  SHELL_APP_BAR_POSITION_CHANGE_EVENT,
  SHELL_APP_BAR_POSITION_NOOP,
  type ShellAppBarPositionPersistence,
  writeAppBarPositionToStorage,
} from "../types/shell-app-bar-position";
import { useMediaQuery } from "./use-media-query";

/** App-bar edge from the instant-paint cache. Safe outside `AppBarChromeProvider`. */
export function useAppBarPosition(): AppBarPosition {
  const [position, setPosition] = useState<AppBarPosition>(
    () => readAppBarPositionFromStorage() ?? DEFAULT_APP_BAR_POSITION
  );

  useEffect(() => {
    const syncPosition = () => {
      setPosition(readAppBarPositionFromStorage() ?? DEFAULT_APP_BAR_POSITION);
    };
    window.addEventListener(SHELL_APP_BAR_POSITION_CHANGE_EVENT, syncPosition);
    return () => {
      window.removeEventListener(
        SHELL_APP_BAR_POSITION_CHANGE_EVENT,
        syncPosition
      );
    };
  }, []);

  return position;
}

export function useAppBarChrome(
  persistence: ShellAppBarPositionPersistence = SHELL_APP_BAR_POSITION_NOOP
) {
  const [storedSidebarMode, setStoredSidebarMode] = useState<
    "compact" | "extended"
  >(() => {
    try {
      const stored = localStorage.getItem("engenty:sidebar-mode");
      return stored === "extended" ? "extended" : "compact";
    } catch {
      return "compact";
    }
  });

  const [isSidebarHidden, setIsSidebarHiddenState] = useState(() => {
    try {
      return localStorage.getItem("engenty:sidebar-hidden") === "true";
    } catch {
      return false;
    }
  });

  const position = useAppBarPosition();

  const [isHoveringSidebar, setIsHoveringSidebar] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleModeChange = () => {
      try {
        const stored = localStorage.getItem("engenty:sidebar-mode");
        setStoredSidebarMode(stored === "extended" ? "extended" : "compact");
      } catch {
        // ignore
      }
    };
    window.addEventListener("engenty:sidebar-mode-change", handleModeChange);
    return () =>
      window.removeEventListener(
        "engenty:sidebar-mode-change",
        handleModeChange
      );
  }, []);

  useEffect(() => {
    const handleSidebarHiddenChange = () => {
      setIsSidebarHiddenState(
        localStorage.getItem("engenty:sidebar-hidden") === "true"
      );
    };
    window.addEventListener(
      "engenty:sidebar-hidden-change",
      handleSidebarHiddenChange
    );
    return () => {
      window.removeEventListener(
        "engenty:sidebar-hidden-change",
        handleSidebarHiddenChange
      );
    };
  }, []);

  // Same reach as "Hide App Bar": this tab's preference, applied at once. The
  // tenant appearance setting (Settings → Appearance) re-seeds it on load.
  const setSidebarMode = useCallback((mode: "compact" | "extended") => {
    setStoredSidebarMode(mode);
    try {
      localStorage.setItem("engenty:sidebar-mode", mode);
      window.dispatchEvent(new Event("engenty:sidebar-mode-change"));
    } catch (e) {
      console.error(e);
    }
  }, []);

  const updateSidebarHidden = useCallback((hidden: boolean) => {
    setIsSidebarHiddenState(hidden);
    try {
      localStorage.setItem("engenty:sidebar-hidden", hidden ? "true" : "false");
      window.dispatchEvent(new Event("engenty:sidebar-hidden-change"));
    } catch (e) {
      console.error(e);
    }
  }, []);

  const setAppBarPosition = useCallback(
    (next: AppBarPosition) => {
      writeAppBarPositionToStorage(next);
      persistence.mergePosition({ position: next });
    },
    [persistence]
  );

  const handleMouseEnter = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsHoveringSidebar(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHoveringSidebar(false);
    }, 350);
  }, []);

  useEffect(
    () => () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    },
    []
  );

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const handleContextMenu = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // The preference survives, the rendering does not: narrow viewports fall
  // back to the compact rail no matter what was picked.
  const wideEnough = useMediaQuery(APP_BAR_EXTENDED_MEDIA_QUERY);
  const sidebarMode: "compact" | "extended" =
    storedSidebarMode === "extended" && wideEnough ? "extended" : "compact";
  const thickness = appBarThicknessPx(position, sidebarMode);
  const horizontal = isHorizontalAppBarPosition(position);
  /** Extended is a left/right, wide-viewport affair. */
  const extendedAvailable = !horizontal && wideEnough;

  return {
    closeContextMenu,
    contextMenu,
    extendedAvailable,
    handleContextMenu,
    handleMouseEnter,
    handleMouseLeave,
    horizontal,
    isHoveringSidebar,
    isSidebarHidden,
    position,
    setAppBarPosition,
    setSidebarMode,
    sidebarMode,
    storedSidebarMode,
    thickness,
    updateSidebarHidden,
  };
}
