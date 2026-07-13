import {
  PaneResizeHandle,
  setWorkspaceEndPaneExpanded,
  usePersistedEwResizePaneWidth,
  useWorkspaceEndPaneTarget,
} from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQueryClient } from "@engenty/query-client";
import { Button, cn, topbarIconButtonClassName } from "@engenty/ui-core";
import { PanelRightOpen } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useCopilotThreadBinding } from "../copilot/copilot-thread-binding-provider.js";
import { ArtifactPane } from "./artifact-pane.js";
import { useArtifactListSync, useArtifacts } from "./artifact-store.js";
import {
  archiveArtifact,
  artifactsQueryRoot,
  resolveEngentyAiServiceBaseUrlSafe,
  useArtifactDetailQuery,
  useArtifactsListQuery,
} from "./artifacts-api.js";

/**
 * Route-level artifact pane. Always mounted on the route: it fetches the
 * active thread's artifacts (the tabs), auto-opens when the agent creates a
 * new one, reconciles the active tab, and portals the ArtifactPane into the
 * shell's workspace end-pane slot. Pair with `ArtifactPaneToggle` in the page
 * topbar actions.
 */
export function WorkspaceArtifactPane({ hostKey }: { hostKey: string }) {
  const { t } = useTranslation("ai-ui");
  const queryClient = useQueryClient();
  const { activeThreadId } = useCopilotThreadBinding();
  const threadId = activeThreadId?.trim() || null;

  const {
    activeId,
    paneExpanded,
    paneOpen,
    activate,
    setPaneExpanded,
    setPaneOpen,
  } = useArtifacts(hostKey);

  const listQuery = useArtifactsListQuery("thread", threadId);
  const artifacts = listQuery.data ?? [];

  useArtifactListSync({
    hostKey,
    threadId,
    ids: artifacts.map((a) => a.id),
    isReady: listQuery.isSuccess,
  });

  const activeVersion = artifacts.find(
    (a) => a.id === activeId
  )?.current_version;
  const detailQuery = useArtifactDetailQuery(activeId, activeVersion);

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

  const archive = useMutation({
    mutationFn: (artifactId: string) =>
      archiveArtifact({
        serviceBaseUrl: resolveEngentyAiServiceBaseUrlSafe(),
        artifactId,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: artifactsQueryRoot }),
  });

  // Grow the end-pane column over the main area while expanded; always reset
  // when leaving the route.
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
      className={cn("flex h-full min-h-0", paneExpanded && "min-w-0 flex-1")}
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
        activeContent={detailQuery.data?.version.content ?? null}
        activeId={activeId}
        artifacts={artifacts}
        className={paneExpanded ? "my-2 mr-2 ml-2 min-w-0 flex-1" : "my-2 mr-2"}
        isContentLoading={detailQuery.isLoading}
        onActivate={activate}
        onClose={(id) => archive.mutate(id)}
        onSetExpanded={setPaneExpanded}
        onSetPaneOpen={setPaneOpen}
        paneExpanded={paneExpanded}
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
