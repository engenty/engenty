// Maps the copilot host onto `<CopilotDrawer />`, composing only what
// UI-core needs (draft recovery, panel labels). The thread is the river
// (`useCopilotRiver`); transcript and submit/cancel come from `useAgentHost`.

import {
  approveCopilotOpenInterrupt,
  COPILOT_WHO_ID,
  CompanionWorkChat,
  type CopilotChatOnFinish,
  CopilotDrawer,
  type CopilotDrawerInjectedSession,
  type CopilotPanelContentProps,
  type CopilotRouteContext,
  ENGENTY_COPILOT_HOST_KEY,
  type FieldSuggestion,
  registerCopilotComposerDraftSetter,
  type SubmitMessage,
  useAgentHost,
  useCopilotAssistantTurnFinish,
  useCopilotComposerDraftRecovery,
  useCopilotInitialMessages,
  useCopilotRiver,
  useCopilotSuggestionsState,
  useEngentyAIContext,
} from "@engenty/ai-ui";
import { getCurrentAccessToken } from "@engenty/api-client";
import type { CopilotDockMode } from "@engenty/app-shell";
import {
  useAgentUiFrontendToolExecutor,
  useCopilotShellOrNull,
} from "@engenty/app-shell";
import { CopilotEffortControl } from "@engenty/engenty-copilot/ui/effort-control";
import { useTranslation } from "@engenty/i18n/ui";
import type { UiCopilotContribution } from "@engenty/ui-plugin-sdk";
import { usePageHeader } from "@engenty/ui-plugin-sdk";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Location } from "react-router-dom";
import { CopilotSurfaceErrorBoundary } from "@/components/copilot-surface-error-boundary";
import { parseSpacePath } from "@/lib/space-routes";
import { useSpacesQuery } from "@/lib/spaces-queries";
import { useSpaceRosterAgents } from "@/lib/use-space-roster-agents";

interface CopilotShellLike {
  copilotDockRef?: { current: HTMLDivElement | null };
  copilotLayout?: unknown;
  copilotSidebarRef?: { current: HTMLDivElement | null };
  mainContentReady?: boolean;
  mainContentRef?: { current: HTMLElement | null };
  preferredDockMode?: CopilotDockMode | null;
}

export interface CopilotDrawerLayerProps {
  agentUi: {
    frontend_tools: ReturnType<
      typeof import("@engenty/app-shell").useAgentUiFrontendTools
    >;
    state_snapshot: ReturnType<
      typeof import("@engenty/app-shell").useAgentUiStateSnapshot
    >;
  };
  contribution: UiCopilotContribution | null;
  copilotAutoUserMessage?: string;
  copilotContext: CopilotRouteContext;
  currentTenant: { id: string } | null | undefined;
  dockMode: CopilotDockMode | undefined;
  hasApply: boolean;
  launchScope: Record<string, unknown> | undefined;
  location: Location;
  onApplySuggestions: (patch: Record<string, string | null>) => Promise<void>;
  onCopilotApplySuccess?: () => void;
  onCopilotAssistantTurnFinish?: CopilotChatOnFinish;
  open: boolean;
  requestedAgentId?: string;
  setOpen: (open: boolean) => void;
  setPreferredDockMode?: (mode: CopilotDockMode | null) => void;
  shell: CopilotShellLike | null;
  startMode: "manual" | "auto";
  triggerType: "message_copilot" | "button" | "shortcut";
}

function mapPanelStatus(
  status: CopilotPanelContentProps["status"]
): CopilotPanelContentProps["status"] {
  return status;
}

async function defaultGetHeaders(): Promise<Record<string, string>> {
  const token = await getCurrentAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function useDrawerInjectedSession(input: {
  autoUserMessage: string | undefined;
  contribution: UiCopilotContribution | null;
  open: boolean;
  routeContext: CopilotRouteContext;
  startMode: "manual" | "auto";
  tenantId: string;
  userId: string;
}): CopilotDrawerInjectedSession {
  const river = useCopilotRiver();
  const host = useAgentHost(ENGENTY_COPILOT_HOST_KEY);
  const { openInterruptFromSession } = useCopilotInitialMessages(
    river.threadId
  );

  const recoverySessionKey = river.threadId ?? "river";
  const draftRecovery = useCopilotComposerDraftRecovery({
    messages: host.messages,
    threadId: recoverySessionKey,
    tenantId: input.tenantId,
    userId: input.userId,
  });

  // Module pages hand work to the copilot by prefilling this composer
  // (`setCopilotComposerDraft`). Full-page chat registers the same bridge;
  // the two surfaces are never mounted together, and latest registration wins.
  useEffect(
    () =>
      registerCopilotComposerDraftSetter(
        ENGENTY_COPILOT_HOST_KEY,
        draftRecovery.setDraft
      ),
    [draftRecovery.setDraft]
  );

  const latestSuggestions = useMemo<FieldSuggestion[]>(() => [], []);

  const {
    applyError,
    isApplying,
    selectedCandidateValues,
    selectedSuggestions,
    setApplyError,
    setIsApplying,
    setSelectedCandidateValues,
    setSelectedSuggestions,
  } = useCopilotSuggestionsState(latestSuggestions);

  const status =
    host.pendingSend && host.status === "ready" ? "submitted" : host.status;

  // MUST forward `options` (attachments, agent override) — a text-only wrapper
  // here silently drops uploaded attachments. Attachment-only sends are valid.
  const submitMessage = useCallback<SubmitMessage>(
    (text, options) => {
      const trimmed = text.trim();
      if (!(trimmed || options?.attachments?.length)) {
        return;
      }
      draftRecovery.clearDraft();
      host.submitMessage(trimmed, options);
    },
    [host.submitMessage, draftRecovery.clearDraft]
  );

  const appendWithHeaders = useCallback(
    async (text: string) => {
      submitMessage(text);
    },
    [submitMessage]
  );

  const clearLocalSessionState = useCallback(() => {
    draftRecovery.clearDraft();
    setApplyError(null);
    setIsApplying(false);
    setSelectedCandidateValues({});
    setSelectedSuggestions({});
  }, [
    draftRecovery.clearDraft,
    setApplyError,
    setIsApplying,
    setSelectedCandidateValues,
    setSelectedSuggestions,
  ]);

  const autoStartedSessionRef = useRef<string | null>(null);
  const autoUserMessage = input.autoUserMessage?.trim() ?? "";
  useEffect(() => {
    if (!input.open || input.startMode !== "auto") {
      return;
    }
    if (autoStartedSessionRef.current === river.threadId) {
      return;
    }
    if (
      !autoUserMessage ||
      host.messages.length > 0 ||
      host.status !== "ready"
    ) {
      return;
    }
    autoStartedSessionRef.current = river.threadId;
    submitMessage(autoUserMessage);
  }, [
    autoUserMessage,
    river.threadId,
    host.messages.length,
    host.status,
    input.open,
    input.startMode,
    submitMessage,
  ]);

  return {
    activeThreadId: river.threadId,
    appendWithHeaders,
    applyError,
    artifactError: null,
    awaitingInterrupt: host.awaitingInterrupt,
    openInterruptFromStream: host.openInterruptFromStream,
    pendingInterruptToolCallIds: host.pendingInterruptToolCallIds,
    optimisticInterruptResults: host.optimisticInterruptResults,
    resolvedInterruptToolCallIds: host.resolvedInterruptToolCallIds,
    respond: host.respond,
    dismissInterrupt: host.dismissInterrupt,
    cancelRun: host.cancel,
    contextPayload: input.routeContext,
    draft: draftRecovery.draft,
    error: host.error,
    isApplying,
    latestSuggestions,
    lifecycle:
      status === "submitted" || status === "streaming" ? "running" : "idle",
    messages: host.copilotMessages,
    pauseRun: () => {},
    pendingUserInsertIndex: host.pendingUserInsertIndex,
    pendingUserParts: host.pendingUserParts,
    pendingUserText: host.pendingUserText,
    resumeInterrupt: host.resumeInterrupt,
    resumeRun: host.resumeActiveRun,
    selectedCandidateValues,
    selectedSuggestions,
    threadResetKey: host.threadResetKey,
    setApplyError,
    setDraft: draftRecovery.setDraft,
    setIsApplying,
    setSelectedCandidateValues,
    setSelectedSuggestions,
    status: mapPanelStatus(status),
    submitMessage,
    openInterruptFromSession,
  };
}

export function CopilotDrawerLayer(props: CopilotDrawerLayerProps) {
  const { t } = useTranslation("common");
  const { topbarChrome } = usePageHeader();
  const river = useCopilotRiver();
  const host = useAgentHost(ENGENTY_COPILOT_HOST_KEY);
  const shellCtx = useCopilotShellOrNull();
  const spacePath = parseSpacePath(props.location.pathname);
  const spacesQuery = useSpacesQuery();
  const space = useMemo(
    () =>
      spacesQuery.data?.find(
        (candidate) => candidate.key === spacePath?.spaceKey
      ),
    [spacePath?.spaceKey, spacesQuery.data]
  );
  const { agents: rosterAgents } = useSpaceRosterAgents(space?.id ?? null);
  const { openInterruptFromSession } = useCopilotInitialMessages(
    river.threadId
  );
  const ai = useEngentyAIContext();
  const executeFrontendTool = useAgentUiFrontendToolExecutor();

  const tenantId = props.currentTenant?.id ?? "";
  const userId = river.userId;

  const injectedSession = useDrawerInjectedSession({
    autoUserMessage: props.copilotAutoUserMessage,
    contribution: props.contribution,
    open: props.open,
    routeContext: props.copilotContext,
    startMode: props.startMode,
    tenantId,
    userId,
  });

  const agentChooserLabels = useMemo(
    () => ({ selectAgent: t("copilot.agentChooser.selectAgent") }),
    [t]
  );

  const whoOptions = useMemo(
    () => [
      {
        engenty: "round" as const,
        id: COPILOT_WHO_ID,
        name: t("copilot.title"),
      },
      ...rosterAgents.map((agent) => ({
        ...(agent.avatarUrl ? { avatarUrl: agent.avatarUrl } : {}),
        engenty: agent.engenty,
        id: agent.id,
        name: agent.name,
      })),
    ],
    [rosterAgents, t]
  );

  const workPanelContent =
    shellCtx?.companionWho.kind === "engenty" && space?.id ? (
      <CompanionWorkChat
        agentId={shellCtx.companionWho.agentId}
        spaceId={space.id}
      />
    ) : undefined;

  const onClose = useCallback(() => {
    props.setOpen(false);
  }, [props.setOpen]);

  useCopilotAssistantTurnFinish(props.onCopilotAssistantTurnFinish);

  const handleSandboxCommandApprove = useCallback(
    async (open: import("@engenty/ag-ui-bridge").AgUiOpenInterruptMetadata) => {
      await approveCopilotOpenInterrupt({
        activeThreadId: river.threadId,
        executeFrontendTool,
        onSuccess: props.onCopilotApplySuccess,
        open,
        resumeInterrupt: host.resumeInterrupt,
      });
    },
    [
      river.threadId,
      executeFrontendTool,
      host.resumeInterrupt,
      props.onCopilotApplySuccess,
    ]
  );

  const handleSandboxCommandReject = useCallback(
    (open: import("@engenty/ag-ui-bridge").AgUiOpenInterruptMetadata) => {
      if (open.tool_name) {
        host.resumeInterrupt?.({
          approved: false,
          interruptId: open.interrupt_id,
          toolName: open.tool_name,
        });
      }
    },
    [host.resumeInterrupt]
  );

  return (
    <CopilotSurfaceErrorBoundary
      debugContext={{
        contributionTitle: props.contribution?.title,
        dockMode: props.dockMode,
        moduleId: props.copilotContext.moduleId,
        pathname: props.location.pathname,
        routeKey: props.copilotContext.routeKey,
      }}
      onClose={onClose}
      resetKey={`${props.dockMode ?? "local"}:${String(props.open)}`}
    >
      <CopilotDrawer
        agentChooserLabels={agentChooserLabels}
        agentUi={props.agentUi}
        applySelectedLabel={t("copilot.applySelected")}
        artifactLoadFailedLabel={t("copilot.artifactLoadFailed")}
        cancelLabel={t("copilot.cancel")}
        compactLabel={t("copilot.compact")}
        composerLeadingControl={<CopilotEffortControl />}
        composerPlaceholder={t("copilot.typeMessage")}
        copilotContext={props.copilotContext}
        copilotDockRef={props.shell?.copilotDockRef as never}
        copilotLayout={(props.shell?.copilotLayout ?? null) as never}
        copilotSidebarRef={props.shell?.copilotSidebarRef as never}
        copyThreadCopiedLabel={t("copilot.copyThreadCopied")}
        copyThreadLabel={t("copilot.copyThread")}
        dockMode={props.dockMode}
        dragHandleLabel={t("copilot.dragHandle")}
        getHeaders={defaultGetHeaders}
        headerChrome={topbarChrome === "band" ? "default" : "contentBlend"}
        injectedSession={{
          ...injectedSession,
          openInterruptFromSession,
        }}
        mainContentReady={props.shell?.mainContentReady ?? false}
        mainContentRef={props.shell?.mainContentRef}
        module={props.copilotContext.moduleId}
        onApplySuccess={
          props.hasApply ? props.onCopilotApplySuccess : undefined
        }
        onApplySuggestions={
          props.hasApply ? props.onApplySuggestions : undefined
        }
        onAssistantTurnFinish={props.onCopilotAssistantTurnFinish}
        onOpenChange={props.setOpen}
        onSandboxCommandInterruptApprove={handleSandboxCommandApprove}
        onSandboxCommandInterruptReject={handleSandboxCommandReject}
        open={props.open}
        openInterruptFromSession={openInterruptFromSession}
        positionDrawerLabel={t("copilot.position.drawer")}
        positionFullscreenLabel={t("copilot.position.fullscreen")}
        positionHeadingLabel={t("copilot.position.heading")}
        positionMenuAriaLabel={t("copilot.position.menu")}
        positionSidebarLabel={t("copilot.position.sidebar")}
        positionWindowLabel={t("copilot.position.window")}
        preferredDockMode={props.shell?.preferredDockMode ?? null}
        reviewPromptLabel={t("copilot.reviewPrompt")}
        routeKey={props.copilotContext.routeKey}
        runtimeTenantId={tenantId || null}
        scope={props.copilotContext.scope ?? null}
        selectedCountLabel={t("copilot.selected")}
        serviceBaseUrl={ai.serviceBaseUrl}
        setPreferredDockMode={props.setPreferredDockMode}
        starterPrompts={props.contribution?.starterPrompts}
        startMode={props.startMode}
        suggestedUpdatesLabel={t("copilot.suggestedUpdates")}
        thinkingLabel={t("copilot.thinking")}
        title={props.contribution?.title ?? t("copilot.title")}
        triggerType={props.triggerType}
        whoOptions={whoOptions}
        workPanelContent={workPanelContent}
      />
    </CopilotSurfaceErrorBoundary>
  );
}
