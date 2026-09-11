import { readActiveArtifactMetadata } from "@engenty/ag-ui-bridge";
import {
  setWorkspaceEndPaneExpanded,
  useCopilotShell,
  useWorkspaceEndPaneTarget,
  WorkspaceEndPaneItem,
} from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { subscribePostgresChanges } from "@engenty/live-cache";
import { useMutation, useQueryClient } from "@engenty/query-client";
import { Button, cn, topbarIconButtonClassName } from "@engenty/ui-core";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { Layers } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEngentyAIContext } from "../agent-provider/engenty-ai-provider.js";
import { useCopilotThreadBinding } from "../copilot/copilot-thread-binding-provider.js";
import type { ArtifactStoreTarget } from "./artifact-move-menu.js";
import { ArtifactPane } from "./artifact-pane.js";
import {
  activateArtifact,
  closeObjectPaneTab,
  closeWorkFilePaneTab,
  getArtifactPaneOpen,
  isObjectPaneTabKey,
  isTransientPaneTabKey,
  isWorkFilePaneTabKey,
  markUnseenArtifacts,
  setActiveArtifact,
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
   * pane shows everything reachable inside a task/routine/project/global.
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

/**
 * Everything the current space holds, offered in the pane's chooser: an
 * artifact belongs to the space we share, not to the chat that made it. Null
 * outside a space — the chooser then shows only what the pane itself holds.
 */
function useSpaceLibraryContainer(): WorkContainerRef | null {
  const { currentSpace } = useWorkspaceContext();
  const spaceId = currentSpace?.id ?? null;
  return useMemo(
    () => (spaceId ? { id: spaceId, tier: "space" as const } : null),
    [spaceId]
  );
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
  const libraryQuery = useContainerArtifactsQuery(useSpaceLibraryContainer());
  const library = libraryQuery.data ?? [];
  // Artifacts opened from the chooser that this pane's own scopes do not
  // carry. They live for the session: closing one drops it here instead of
  // archiving it, since it belongs to somebody else's chat.
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const scopedArtifacts = mergeArtifacts(
    mergeArtifacts(primaryQuery.data ?? [], containerQuery.data ?? []),
    extraQuery.data ?? []
  );
  const artifacts = mergeArtifacts(
    scopedArtifacts,
    library.filter((a) => pickedIds.includes(a.id))
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

  // Sync which artifact the agent is presenting across every window attached
  // to this thread (written server-side by the show_artifact tool — see
  // ACTIVE_ARTIFACT_METADATA_KEY). Same policy as a freshly-created
  // artifact above: auto-focus when the pane is already open, otherwise
  // badge it so a passive window's pane never pops open on its own.
  const { threadsRealtimeClient } = useEngentyAIContext();
  const appliedActiveArtifactRef = useRef<string | null>(null);
  // Only a presentation made while this window was watching. The key is
  // durable thread metadata and every run writes thread metadata for its own
  // reasons, so without this the next unrelated UPDATE re-applies the last
  // `show_artifact` of the day — live on 2026-09-07 that was an archived
  // artifact, and the pane activated a tab that no longer exists and drew its
  // empty state mid-run. Backdated a minute so clock skew cannot swallow a
  // real presentation.
  const watchingSinceRef = useRef(new Date(Date.now() - 60_000).toISOString());
  const [pendingActiveId, setPendingActiveId] = useState<string | null>(null);
  useEffect(() => {
    appliedActiveArtifactRef.current = null;
    watchingSinceRef.current = new Date(Date.now() - 60_000).toISOString();
    setPendingActiveId(null);
  }, [primaryScope.type, primaryScope.id]);
  useEffect(() => {
    if (
      !(
        primaryScope.type === "thread" &&
        primaryScope.id &&
        threadsRealtimeClient
      )
    ) {
      return;
    }
    const boundThreadId = primaryScope.id;
    const unsubscribe = subscribePostgresChanges({
      channelName: `engenty-thread-active-artifact:${boundThreadId}`,
      client: threadsRealtimeClient,
      changes: [
        {
          event: "UPDATE",
          filter: `id=eq.${boundThreadId}`,
          schema: "ai",
          table: "thread",
        },
      ],
      onSignal: (signal) => {
        const active = readActiveArtifactMetadata(
          (signal.record?.metadata as Record<string, unknown>) ?? null
        );
        if (
          !active ||
          appliedActiveArtifactRef.current === active.shown_at ||
          active.shown_at <= watchingSinceRef.current
        ) {
          return;
        }
        appliedActiveArtifactRef.current = active.shown_at;
        // The activation signal can outrun the tenant-wide ai.artifact
        // invalidation: activating an id the stale list doesn't carry renders
        // an empty pane (observed live in the second window). Refetch the
        // lists on the same signal, and hold the activation until the list
        // actually carries the artifact.
        void queryClient.invalidateQueries({ queryKey: artifactsQueryRoot });
        setPendingActiveId(active.artifact_id);
      },
    });
    return unsubscribe;
  }, [hostKey, primaryScope.type, primaryScope.id, threadsRealtimeClient]);

  // Focus follows the list, never the signal alone: an artifact the pane
  // cannot draw (archived, or living outside this scope) leaves the current
  // tab where it is instead of blanking the pane.
  useEffect(() => {
    if (!(pendingActiveId && artifacts.some((a) => a.id === pendingActiveId))) {
      return;
    }
    if (getArtifactPaneOpen(hostKey)) {
      activateArtifact(hostKey, pendingActiveId);
    } else {
      // Keep the conversation focused — badge + toggle open the pane.
      setActiveArtifact(hostKey, pendingActiveId);
      markUnseenArtifacts(hostKey, [pendingActiveId]);
    }
    setPendingActiveId(null);
  }, [artifacts, hostKey, pendingActiveId]);

  const openArtifact = (id: string) => {
    if (
      library.some((a) => a.id === id) &&
      !artifacts.some((a) => a.id === id)
    ) {
      setPickedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    }
    activate(id);
  };

  const activeArtifactId = isTransientPaneTabKey(activeId) ? null : activeId;
  const activeVersion = artifacts.find(
    (a) => a.id === activeArtifactId
  )?.current_version;
  const detailQuery = useArtifactDetailQuery(activeArtifactId, activeVersion);

  const target = useWorkspaceEndPaneTarget();

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

  // The space the route is in — storing there mounts the artifact in the
  // space's Data tree. The workspace context is the same source every module
  // page reads, so the offer matches what the user is looking at.
  const { currentSpace } = useWorkspaceContext();
  const storeSpaceTarget = currentSpace
    ? { id: currentSpace.id, name: currentSpace.name }
    : null;

  // Grow the end-pane column over the main area while expanded; always reset
  // when leaving the route. The slot sizes the column and stacks the panes,
  // so this pane only registers itself and fills its share.
  const expandRow = paneExpanded && paneOpen;
  useEffect(() => {
    setWorkspaceEndPaneExpanded("artifacts", expandRow);
    return () => setWorkspaceEndPaneExpanded("artifacts", false);
  }, [expandRow]);

  if (!(paneOpen && target)) {
    return null;
  }

  return createPortal(
    <WorkspaceEndPaneItem
      paneKey="artifacts"
      resizeLabel={t("artifacts.resizeStack")}
    >
      <ArtifactPane
        activeContent={detailQuery.data?.version.content ?? null}
        activeId={activeId}
        artifacts={artifacts}
        className="min-h-0 flex-1"
        fileTabs={fileTabs}
        isContentLoading={detailQuery.isLoading}
        library={library}
        objectTabs={objectTabs}
        onActivate={openArtifact}
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
          // A chooser-opened artifact only leaves this pane; the list sync
          // moves focus on. Closing one of the pane's own artifacts archives it.
          if (pickedIds.includes(id)) {
            setPickedIds((prev) => prev.filter((picked) => picked !== id));
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
        storeSpaceTarget={storeSpaceTarget}
        storeTaskTarget={storeTaskTarget}
      />
    </WorkspaceEndPaneItem>,
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
  const libraryQuery = useContainerArtifactsQuery(useSpaceLibraryContainer());
  const artifacts = useMemo(
    () =>
      mergeArtifacts(
        mergeArtifacts(primaryQuery.data ?? [], containerQuery.data ?? []),
        extraQuery.data ?? []
      ),
    [containerQuery.data, extraQuery.data, primaryQuery.data]
  );
  // The chooser reaches the whole space, so anything in it is reason enough to
  // offer the pane.
  const hasContent =
    artifacts.length > 0 ||
    objectTabs.length > 0 ||
    fileTabs.length > 0 ||
    (libraryQuery.data?.length ?? 0) > 0;
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
