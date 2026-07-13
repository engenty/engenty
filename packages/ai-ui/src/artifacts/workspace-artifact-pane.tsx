import {
  PaneResizeHandle,
  setWorkspaceEndPaneExpanded,
  usePersistedEwResizePaneWidth,
  useWorkspaceEndPaneTarget,
} from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn, topbarIconButtonClassName } from "@engenty/ui-core";
import { PanelRightOpen } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ArtifactPane } from "./artifact-pane";
import { useArtifacts } from "./artifact-store";

/**
 * Route-level artifact pane: portals an ArtifactPane (plus resize handle and
 * expanded handling) into the shell's workspace end-pane slot. Render once
 * per route that supports artifacts, paired with `ArtifactPaneToggle` in the
 * page topbar actions.
 */
export function WorkspaceArtifactPane({ hostKey }: { hostKey: string }) {
  const { t } = useTranslation("ai-ui");
  const { paneExpanded, paneOpen } = useArtifacts(hostKey);
  const target = useWorkspaceEndPaneTarget();
  const {
    displayedWidthPx,
    handleResizeKeyDown,
    handleResizePointerDown,
    isResizing,
  } = usePersistedEwResizePaneWidth({
    defaultPx: 480,
    invert: true,
    maxPx: 880,
    minPx: 320,
    storageKey: "engenty.artifact_pane.width_px",
  });

  // Grow the end-pane column over the main area while expanded; always
  // reset when leaving the route.
  const expandRow = paneExpanded && paneOpen;
  useEffect(() => {
    setWorkspaceEndPaneExpanded(expandRow);
    return () => setWorkspaceEndPaneExpanded(false);
  }, [expandRow]);

  if (!(paneOpen && target)) {
    return null;
  }

  return createPortal(
    <div
      className={cn(
        "flex h-full min-h-0",
        // Expanded: fill the slot column (the shell grows it over the
        // collapsed main area — see workspace-end-pane.ts).
        paneExpanded && "min-w-0 flex-1"
      )}
    >
      {paneExpanded ? null : (
        <PaneResizeHandle
          isResizing={isResizing}
          label={t("artifacts.resizePane")}
          onKeyDown={handleResizeKeyDown}
          onPointerDown={handleResizePointerDown}
        />
      )}
      <ArtifactPane
        className={paneExpanded ? "my-2 mr-2 ml-2 min-w-0 flex-1" : "my-2 mr-2"}
        hostKey={hostKey}
        style={paneExpanded ? undefined : { width: displayedWidthPx }}
      />
    </div>,
    target
  );
}

/**
 * Opens the route's artifact pane. Renders nothing while the pane is open —
 * closing belongs to the pane's own top bar. Plain icon (no button chrome),
 * sits at the right edge of the topbar actions.
 */
export function ArtifactPaneToggle({
  className,
  hostKey,
}: {
  className?: string;
  hostKey: string;
}) {
  const { t } = useTranslation("ai-ui");
  const { paneOpen, setPaneOpen } = useArtifacts(hostKey);
  if (paneOpen) {
    return null;
  }
  return (
    <Button
      aria-label={t("artifacts.openPane")}
      className={cn(topbarIconButtonClassName, className)}
      onClick={() => setPaneOpen(true)}
      size="icon"
      variant="ghost"
    >
      <PanelRightOpen className="size-4" />
    </Button>
  );
}
