import {
  PaneResizeHandle,
  setWorkspaceEndPaneExpanded,
  useCopilotShell,
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
import type { ArtifactStoreTarget } from "./artifact-pin-menu.js";
import { useArtifactListSync, useArtifacts } from "./artifact-store.js";
import {
  type ArtifactScopeType,
  type ArtifactSummary,
  archiveArtifact,
  artifactsQueryRoot,
  createArtifactVersion,
  resolveEngentyAiServiceBaseUrlSafe,
  storeArtifact,
  useArtifactDetailQuery,
  useArtifactsListQuery,
} from "./artifacts-api.js";

/** One tab source for the pane; a null id disables the query (no tabs). */
export interface ArtifactPaneScope {
  id: string | null;
  type: ArtifactScopeType;
}

export interface WorkspaceArtifactPaneProps {
  /**
   * Second tab source merged after the primary, e.g. the task a detail page
   * shows: chat artifacts and the task's stored artifacts share one pane.
   */
  extraScope?: ArtifactPaneScope | null;
  hostKey: string;
  /**
   * Primary tab source. Defaults to the bound copilot thread — pass an
   * explicit scope on surfaces without a chat (e.g. the project Artifacts tab).
   */
  scope?: ArtifactPaneScope;
}

function mergeArtifacts(
  primary: ArtifactSummary[],
  extra: ArtifactSummary[]
): ArtifactSummary[] {
  if (extra.length === 0) {
    return primary;
  }
  const seen = new Set(primary.map((a) => a.id));
  return [...primary, ...extra.filter((a) => !seen.has(a.id))];
}

/**
 * Route-level artifact pane. Always mounted on the route: it fetches the
 * scope's artifacts (the tabs), auto-opens when the agent creates a new one,
 * reconciles the active tab, and portals the ArtifactPane into the shell's
 * workspace end-pane slot. Pair with `ArtifactPaneToggle` in the page topbar
 * actions.
 */
export function WorkspaceArtifactPane({
  hostKey,
  scope,
  extraScope,
}: WorkspaceArtifactPaneProps) {
  const { t } = useTranslation("ai-ui");
  const queryClient = useQueryClient();
  const { activeThreadId } = useCopilotThreadBinding();
  const threadId = activeThreadId?.trim() || null;
  const { copilotContext } = useCopilotShell();

  const primaryScope: ArtifactPaneScope = scope ?? {
    type: "thread",
    id: threadId,
  };

  const {
    activeId,
    paneExpanded,
    paneOpen,
    activate,
    setPaneExpanded,
    setPaneOpen,
  } = useArtifacts(hostKey);

  const primaryQuery = useArtifactsListQuery(
    primaryScope.type,
    primaryScope.id
  );
  const extraQuery = useArtifactsListQuery(
    extraScope?.type ?? "task",
    extraScope?.id ?? null
  );
  const artifacts = mergeArtifacts(
    primaryQuery.data ?? [],
    extraQuery.data ?? []
  );

  useArtifactListSync({
    hostKey,
    scopeKey: `${primaryScope.type}:${primaryScope.id ?? "none"}|${extraScope?.type ?? "-"}:${extraScope?.id ?? "-"}`,
    ids: artifacts.map((a) => a.id),
    isReady:
      primaryQuery.isSuccess && (!extraScope?.id || extraQuery.isSuccess),
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

  const storeMutation = useMutation({
    mutationFn: (params: ArtifactStoreTarget & { artifactId: string }) =>
      storeArtifact({
        serviceBaseUrl: resolveEngentyAiServiceBaseUrlSafe(),
        artifactId: params.artifactId,
        scopeType: params.scopeType,
        scopeId: params.scopeId,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: artifactsQueryRoot }),
  });

  // Task detail routes publish their task into the copilot scope — offer it
  // as the one-click store target in the pin menu.
  const ctxScope = copilotContext?.scope as Record<string, unknown> | undefined;
  const ctxTaskId =
    typeof ctxScope?.task_id === "string" ? ctxScope.task_id : null;
  const ctxTaskTitle =
    typeof ctxScope?.task_title === "string" ? ctxScope.task_title : undefined;
  const storeTaskTarget = ctxTaskId
    ? { id: ctxTaskId, title: ctxTaskTitle }
    : null;

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
        onSaveContent={async ({ artifactId, content, expectedVersion }) => {
          await createArtifactVersion({
            serviceBaseUrl: resolveEngentyAiServiceBaseUrlSafe(),
            artifactId,
            content,
            expectedVersion,
            summary: "Edited in the artifact pane",
          });
          await queryClient.invalidateQueries({
            queryKey: artifactsQueryRoot,
          });
        }}
        onSetExpanded={setPaneExpanded}
        onSetPaneOpen={setPaneOpen}
        onStore={(params) => storeMutation.mutate(params)}
        paneExpanded={paneExpanded}
        storePending={storeMutation.isPending}
        storeTaskTarget={storeTaskTarget}
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
