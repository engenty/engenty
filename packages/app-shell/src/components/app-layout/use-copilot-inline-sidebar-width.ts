import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  useCopilotActions,
  useCopilotChromeHidden,
  useCopilotHost,
  useCopilotLayout,
} from "../../context/copilot-shell-context";
import { shouldShowInlineCopilotSidebar } from "../../lib/copilot-chrome";
import {
  COPILOT_SIDEBAR_DEFAULT_WIDTH,
  COPILOT_SIDEBAR_MAX_WIDTH,
  COPILOT_SIDEBAR_MIN_WIDTH,
} from "./constants";

export function useCopilotInlineSidebarWidth() {
  const chromeHidden = useCopilotChromeHidden();
  const { copilotSidebarRef } = useCopilotHost();
  const { dockMode } = useCopilotLayout();
  const { notifySidebarMounted, notifySidebarUnmounted } = useCopilotActions();
  const showInlineCopilotSidebar = shouldShowInlineCopilotSidebar({
    chromeHidden,
    dockMode,
  });

  const [copilotSidebarWidth, setCopilotSidebarWidth] = useState(
    COPILOT_SIDEBAR_DEFAULT_WIDTH
  );
  const [isResizingCopilot, setIsResizingCopilot] = useState(false);
  const resizeStateRef = useRef<{
    startWidth: number;
    startX: number;
  } | null>(null);

  const setSidebarRef = useCallback(
    (el: HTMLDivElement | null) => {
      copilotSidebarRef.current = el;
      if (el) {
        notifySidebarMounted?.();
      } else {
        notifySidebarUnmounted?.();
      }
    },
    [copilotSidebarRef, notifySidebarMounted, notifySidebarUnmounted]
  );

  useEffect(() => {
    if (!showInlineCopilotSidebar) {
      resizeStateRef.current = null;
    }
  }, [showInlineCopilotSidebar]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) {
        return;
      }

      const deltaX = event.clientX - resizeState.startX;
      const nextWidth = Math.max(
        COPILOT_SIDEBAR_MIN_WIDTH,
        Math.min(COPILOT_SIDEBAR_MAX_WIDTH, resizeState.startWidth - deltaX)
      );
      setCopilotSidebarWidth(nextWidth);
    };

    const handlePointerUp = () => {
      if (resizeStateRef.current) {
        setIsResizingCopilot(false);
      }
      resizeStateRef.current = null;
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  const handleSidebarResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      setIsResizingCopilot(true);
      resizeStateRef.current = {
        startWidth: copilotSidebarWidth,
        startX: event.clientX,
      };
      document.body.style.setProperty("cursor", "ew-resize");
      document.body.style.setProperty("user-select", "none");
    },
    [copilotSidebarWidth]
  );

  const handleSidebarResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      const step = 16;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setCopilotSidebarWidth((currentWidth) =>
          Math.min(COPILOT_SIDEBAR_MAX_WIDTH, currentWidth + step)
        );
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        setCopilotSidebarWidth((currentWidth) =>
          Math.max(COPILOT_SIDEBAR_MIN_WIDTH, currentWidth - step)
        );
      }
    },
    []
  );

  const useCopilotWidthTransition = !isResizingCopilot;

  return {
    copilotSidebarWidth,
    handleSidebarResizeKeyDown,
    handleSidebarResizeStart,
    setSidebarRef,
    showInlineCopilotSidebar,
    useCopilotWidthTransition,
  };
}
