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
import { Layers } from "lucide-react";
import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useCopilotThreadBinding } from "../copilot/copilot-thread-binding-provider.js";
import { ArtifactPane } from "./artifact-pane.js";
import type { ArtifactStoreTarget } from "./artifact-pin-menu.js";
import {
  closeObjectPaneTab,
  closeWorkFilePaneTab,
  isObjectPaneTabKey,
  isTransientPaneTabKey,
  isWorkFilePaneTabKey,
  useArtifactListSync,
  useArtifacts,
} from "./artifact-store.js";
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
  useContainerArtifactsQuery,
  type WorkContainerRef,
} from "./artifacts-api.js";

/** One tab source for the pane; a null id disables the query (no tabs). */
export interface ArtifactPaneScope {
  id: string | null;
  type: ArtifactScopeType;
}

export interface WorkspaceArtifactPaneProps {
  /**
   * Work container whose aggregated artifacts fill the pane (Phase 2 resolver).
   * Merged after the primary/extra scopes — the WorkPanel passes this so one
   * pane shows everything reachable inside a task/goal/routine/project/global.
   */
  container?: WorkContainerRef | null;
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
 * scope's artifacts (the tabs), marks fresh ones unseen while closed (or
 * focuses them when already open), reconciles the active tab, and portals
 * the ArtifactPane into the shell's workspace end-pane slot. Pair with
 * `ArtifactPaneToggle` in the page topbar actions.
 */
export function WorkspaceArtifactPane({
  container,
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
    fileTabs,
    objectTabs,
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
  const containerQuery = useContainerArtifactsQuery(container ?? null);
  const extraQuery = useArtifactsListQuery(
    extraScope?.type ?? "task",
    extraScope?.id ?? null
  );
  const artifacts = mergeArtifacts(
    mergeArtifacts(primaryQuery.data ?? [], containerQuery.data ?? []),
    extraQuery.data ?? []
  );

  useArtifactListSync({
    hostKey,
    scopeKey: `${primaryScope.type}:${primaryScope.id ?? "none"}|c:${container ? `${container.tier}:${container.id}` : "-"}|${extraScope?.type ?? "-"}:${extraScope?.id ?? "-"}`,
    ids: artifacts.map((a) => a.id),
    isReady:
      (primaryScope.id ? primaryQuery.isSuccess : true) &&
      (container ? containerQuery.isSuccess : true) &&
      (!extraScope?.id || extraQuery.isSuccess),
  });

  const activeArtifactId = isTransientPaneTabKey(activeId) ? null : activeId;
  const activeVersion = artifacts.find(
    (a) => a.id === activeArtifactId
  )?.current_version;
  const detailQuery = useArtifactDetailQuery(activeArtifactId, activeVersion);

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
        fileTabs={fileTabs}
        isContentLoading={detailQuery.isLoading}
        objectTabs={objectTabs}
        onActivate={activate}
        onClose={(id) => {
          // Object/file tabs are transient view state; artifact tabs archive.
          if (isObjectPaneTabKey(id)) {
            closeObjectPaneTab(
              hostKey,
              id,
              artifacts.map((a) => a.id)
            );
            return;
          }
          if (isWorkFilePaneTabKey(id)) {
            closeWorkFilePaneTab(
              hostKey,
              id,
              artifacts.map((a) => a.id)
            );
            return;
          }
          archive.mutate(id);
        }}
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
 * closing belongs to the pane's own top bar. Muted when the scope has no
 * artifacts (and no object tabs); badges unseen arrivals while closed.
 */
export function ArtifactPaneToggle({
  className,
  container,
  extraScope,
  hostKey,
  scope,
}: {
  className?: string;
  container?: WorkContainerRef | null;
  extraScope?: ArtifactPaneScope | null;
  hostKey: string;
  /** Override primary list scope (defaults to the bound copilot thread). */
  scope?: ArtifactPaneScope;
}) {
  const { t } = useTranslation("ai-ui");
  const { activeThreadId } = useCopilotThreadBinding();
  const { fileTabs, objectTabs, openPane, paneOpen, unseenCount } =
    useArtifacts(hostKey);

  const primaryScope: ArtifactPaneScope = scope ?? {
    type: "thread",
    id: activeThreadId?.trim() || null,
  };
  const primaryQuery = useArtifactsListQuery(
    primaryScope.type,
    primaryScope.id
  );
  const containerQuery = useContainerArtifactsQuery(container ?? null);
  const extraQuery = useArtifactsListQuery(
    extraScope?.type ?? "task",
    extraScope?.id ?? null
  );
  const artifacts = useMemo(
    () =>
      mergeArtifacts(
        mergeArtifacts(primaryQuery.data ?? [], containerQuery.data ?? []),
        extraQuery.data ?? []
      ),
    [containerQuery.data, extraQuery.data, primaryQuery.data]
  );
  const hasContent =
    artifacts.length > 0 || objectTabs.length > 0 || fileTabs.length > 0;
  const badgeLabel =
    unseenCount > 99 ? "99+" : unseenCount > 0 ? String(unseenCount) : null;

  if (paneOpen) {
    return null;
  }

  return (
    <Button
      aria-label={
        unseenCount > 0
          ? t("artifacts.openPaneWithNew", { count: unseenCount })
          : t("artifacts.openPane")
      }
      className={cn(
        topbarIconButtonClassName,
        // Square icon hit-target — contentBlend topbar forces !px-2 on buttons,
        // which otherwise leaves a wide empty gap after solid CTAs.
        "!size-7 !w-7 !min-w-7 !px-0 relative",
        !hasContent && "opacity-40",
        className
      )}
      disabled={!hasContent}
      onClick={() =>
        openPane(
          artifacts[0]?.id ?? objectTabs[0]?.key ?? fileTabs[0]?.key ?? null
        )
      }
      size="icon"
      variant="ghost"
    >
      <Layers className="size-4" />
      {badgeLabel ? (
        <span
          aria-hidden
          className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-medium text-[10px] text-primary-foreground leading-none"
        >
          {badgeLabel}
        </span>
      ) : null}
    </Button>
  );
}
