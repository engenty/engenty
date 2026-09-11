import { cn } from "@engenty/ui-core";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
} from "react";
import {
  getWorkspaceEndPaneElement,
  registerWorkspaceEndPane,
  setWorkspaceEndPaneSplit,
  useWorkspaceEndPaneSlot,
} from "./workspace-end-pane";

const SPLIT_STEP_PCT = 5;

/**
 * One pane's place in the workspace end-pane stack: registers the pane,
 * takes its share of the column's height, and — for every pane but the
 * first — draws the north-south handle above it that moves the split.
 * Wrap the portalled `Pane` in it.
 */
export function WorkspaceEndPaneItem({
  children,
  paneKey,
  resizeLabel = "Resize side panels",
}: {
  children: ReactNode;
  paneKey: string;
  resizeLabel?: string;
}) {
  useEffect(() => registerWorkspaceEndPane(paneKey), [paneKey]);
  const { count, index, splitPct } = useWorkspaceEndPaneSlot(paneKey);
  const dragging = useRef(false);

  // The first pane takes the split; the rest share what is left.
  const grow =
    count <= 1 || index < 0
      ? 1
      : index === 0
        ? splitPct
        : (100 - splitPct) / (count - 1);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const slot = getWorkspaceEndPaneElement();
      if (!(dragging.current && slot)) {
        return;
      }
      const rect = slot.getBoundingClientRect();
      if (rect.height <= 0) {
        return;
      }
      setWorkspaceEndPaneSplit(
        ((event.clientY - rect.top) / rect.height) * 100
      );
    };
    const onUp = () => {
      if (!dragging.current) {
        return;
      }
      dragging.current = false;
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
      setWorkspaceEndPaneSplit(splitPctRef.current, true);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);
  const splitPctRef = useRef(splitPct);
  splitPctRef.current = splitPct;

  const onHandlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    dragging.current = true;
    document.body.style.setProperty("cursor", "ns-resize");
    document.body.style.setProperty("user-select", "none");
  };
  const onHandleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setWorkspaceEndPaneSplit(splitPct - SPLIT_STEP_PCT, true);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setWorkspaceEndPaneSplit(splitPct + SPLIT_STEP_PCT, true);
    }
  };

  return (
    <div
      className="flex min-h-0 min-w-0 flex-col"
      style={{ flexBasis: 0, flexGrow: grow }}
    >
      {index > 0 ? (
        <button
          aria-label={resizeLabel}
          className={cn(
            "h-2 w-full shrink-0 cursor-ns-resize rounded-full bg-transparent transition-colors hover:bg-border/80 focus-visible:bg-border focus-visible:outline-none"
          )}
          onKeyDown={onHandleKeyDown}
          onPointerDown={onHandlePointerDown}
          type="button"
        >
          <span className="sr-only">{resizeLabel}</span>
        </button>
      ) : null}
      {children}
    </div>
  );
}
