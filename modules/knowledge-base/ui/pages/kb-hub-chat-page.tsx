/**
 * Knowledge base scoped chat — full AI session with the KB manager agent.
 * Reached from the KB hub when the user submits a 3-word+ question.
 * A `?q=` param is auto-submitted on first load.
 */

import {
  appsAiThreadDetailQueryKey,
  appsAiThreadMessagesQueryKey,
  CHAT_LANE_COMPOSER_CLASS,
  CHAT_LANE_TRANSCRIPT_CLASS,
  CopilotPanelContent,
  type CopilotRouteContext,
  EngentyAgent,
  isAgUiOpenInterruptExpired,
  readAgUiOpenInterrupt,
  resolveEngentyAiServiceBaseUrl,
  type SubmitMessage,
  useAgentHostConfig,
  useAppsAiThreadMessagesQuery,
  useAppsAiThreadQuery,
} from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { Skeleton } from "@engenty/ui-core";
import { usePageConfig, useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import {
  type MutableRefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { KbModuleShellActions } from "../components/kb-module-shell-actions.js";
import { useKbModuleSecondaryShellNav } from "../hooks/use-kb-module-secondary-shell-nav.js";
import { kbDisplayName } from "../kb-display-name.js";
import {
  kbModulePageFillShellSectionClassName,
  kbModulePageShellSectionClassName,
} from "../lib/kb-page-shell.js";
import { kbSettingsQueryOptions, useKbsQuery } from "../queries.js";
import { spaceKbId } from "../resolve-kb-id.js";

/** Scoped read-only agent for the KB hub chat surface. */
const KB_ANSWERS_AGENT_ID = "knowledge-base.answers";

/** URL-only launch identity — excludes `kbId` so client nav does not reset mid-submit when KB resolves. */
function resolveKbHubLaunchKey(params: {
  hubRun: string;
  qFromUrl: string;
}): string {
  return `${params.hubRun}\u0000${params.qFromUrl}`;
}

export function KbHubChatPage() {
  const { pathname } = useLocation();
  const autoSubmittedRef = useRef<string | null>(null);
  const pendingAutoSubmitKeyRef = useRef<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const threadId = searchParams.get("thread_id")?.trim() || null;

  const handleSessionCreated = useCallback(
    (newThreadId: string) => {
      const pending = pendingAutoSubmitKeyRef.current;
      if (pending) {
        autoSubmittedRef.current = pending;
        pendingAutoSubmitKeyRef.current = null;
      }
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("thread_id", newThreadId);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  return (
    <EngentyAgent
      agentId={KB_ANSWERS_AGENT_ID}
      hostKey="kb:search"
      onThreadCreated={handleSessionCreated}
      routeContext={{
        moduleId: "knowledge-base",
        pathname,
        routeKey: "chat",
      }}
      threadId={threadId}
    >
      <KbHubChatPageContent
        autoSubmittedRef={autoSubmittedRef}
        pendingAutoSubmitKeyRef={pendingAutoSubmitKeyRef}
      />
    </EngentyAgent>
  );
}

function KbHubChatPageContent(props: {
  autoSubmittedRef: MutableRefObject<string | null>;
  pendingAutoSubmitKeyRef: MutableRefObject<string | null>;
}) {
  const { autoSubmittedRef, pendingAutoSubmitKeyRef } = props;
  const { t } = useTranslation("kb");
  const { t: tc, i18n } = useTranslation("common");
  const uiLanguage = i18n.language?.startsWith("de") ? "de" : "en";
  const { currentTenant, currentUserId } = useWorkspaceContext();
  const tenantId = currentTenant?.id ?? "";
  const userId = currentUserId ?? "";

  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const qFromUrl = searchParams.get("q") ?? "";
  const hubRun = searchParams.get("hub_run")?.trim() ?? "";

  const { data: kbs = [], isLoading: kbsLoading } = useKbsQuery();
  const { data: kbSettings } = useQuery(kbSettingsQueryOptions);

  const kbId = useMemo(() => spaceKbId(kbs), [kbs]);

  const activeKb = kbs.find((k) => k.id === kbId);
  const kbName = activeKb ? kbDisplayName(activeKb, t) : t("hub.title");

  // One knowledge base per space: the chat is always scoped to it.
  const copilotScope = useMemo(
    () => ({
      ui_language: uiLanguage,
      current_module: "knowledge-base",
      kb_chat_scope: "single",
      kb_id: kbId,
      ...(hubRun ? { hub_run: hubRun } : {}),
    }),
    [uiLanguage, kbId, hubRun]
  );

  const copilotContext = useMemo(
    () =>
      ({
        moduleId: "knowledge-base",
        pathname,
        routeKey: "chat",
        scope: copilotScope,
      }) satisfies CopilotRouteContext,
    [pathname, copilotScope]
  );

  const chatStarterPrompts = useMemo(
    () => [
      {
        id: "find-contacts",
        label: tc("copilot.empty.starters.findContacts.label"),
        prompt: tc("copilot.empty.starters.findContacts.prompt"),
      },
      {
        id: "draft-follow-up",
        label: tc("copilot.empty.starters.draftFollowUp.label"),
        prompt: tc("copilot.empty.starters.draftFollowUp.prompt"),
      },
      {
        id: "plan-work",
        label: tc("copilot.empty.starters.planWork.label"),
        prompt: tc("copilot.empty.starters.planWork.prompt"),
      },
      {
        id: "what-can-you-do",
        label: tc("copilot.empty.starters.whatCanYouDo.label"),
        prompt: tc("copilot.empty.starters.whatCanYouDo.prompt"),
      },
    ],
    [tc]
  );

  const serviceBaseUrl = resolveEngentyAiServiceBaseUrl() ?? "";
  const isTransportReady = serviceBaseUrl.length > 0;
  const [draft, setDraft] = useState("");
  const hubLaunchKey = resolveKbHubLaunchKey({
    hubRun: hubRun || "direct",
    qFromUrl,
  });
  const hubLaunchKeyRef = useRef(hubLaunchKey);
  const resetSessionRef = useRef<() => void>(() => {});
  const session = useAgentHostConfig({
    agentId: KB_ANSWERS_AGENT_ID,
    hostKey: "kb:search",
    modelId: "",
    pathname,
    routeContext: copilotContext,
  });
  resetSessionRef.current = session.reset;

  const activeThreadId = session.activeThreadId;
  const kbContextReady = !kbsLoading && Boolean(kbId);

  const threadDetailQueryKey = useMemo(
    () =>
      activeThreadId
        ? appsAiThreadDetailQueryKey({
            serviceBaseUrl,
            threadId: activeThreadId,
          })
        : undefined,
    [activeThreadId, serviceBaseUrl]
  );

  const messagesQueryKey = useMemo(
    () =>
      activeThreadId
        ? appsAiThreadMessagesQueryKey({
            serviceBaseUrl,
            threadId: activeThreadId,
          })
        : undefined,
    [activeThreadId, serviceBaseUrl]
  );

  const sessionDetailQuery = useAppsAiThreadQuery({
    enabled: isTransportReady && Boolean(activeThreadId),
    serviceBaseUrl,
    threadId: activeThreadId,
  });

  const messagesQuery = useAppsAiThreadMessagesQuery({
    enabled: isTransportReady && Boolean(activeThreadId),
    serviceBaseUrl,
    threadId: activeThreadId,
  });

  const initialMessages = useMemo(() => {
    if (!activeThreadId || messagesQuery.isLoading) {
      return;
    }
    return messagesQuery.agUiMessages;
  }, [activeThreadId, messagesQuery.agUiMessages, messagesQuery.isLoading]);

  const openInterruptFromSession = useMemo(
    () => readAgUiOpenInterrupt(sessionDetailQuery.data?.metadata ?? null),
    [sessionDetailQuery.data?.metadata]
  );

  // The LIVE stream value wins while set. `requestDecision` SUSPENDS the run
  // (apps/ai native-request-decision.ts), so the chooser exists only in the open
  // interrupt — the tool call has no output for the transcript path to read, and
  // the persisted thread metadata only catches up after a refetch. Same
  // three-way resolution as the drawer (copilot-drawer-body.tsx) and the
  // full-page copilot chat.
  const resolvedOpenInterrupt = useMemo(() => {
    const fromStream = session.openInterruptFromStream;
    if (fromStream && !isAgUiOpenInterruptExpired(fromStream)) {
      return fromStream;
    }
    if (
      openInterruptFromSession &&
      !isAgUiOpenInterruptExpired(openInterruptFromSession)
    ) {
      return openInterruptFromSession;
    }
    return null;
  }, [session.openInterruptFromStream, openInterruptFromSession]);

  useEffect(() => {
    if (hubLaunchKeyRef.current === hubLaunchKey) {
      return;
    }
    hubLaunchKeyRef.current = hubLaunchKey;
    autoSubmittedRef.current = null;
    pendingAutoSubmitKeyRef.current = null;
    resetSessionRef.current();
  }, [autoSubmittedRef, hubLaunchKey, pendingAutoSubmitKeyRef]);

  useEffect(() => {
    session.configureHost({
      initialMessages,
      messagesQueryKey,
      openInterruptFromSession,
      threadDetailQueryKey,
    });
  }, [
    initialMessages,
    messagesQueryKey,
    openInterruptFromSession,
    session.configureHost,
    threadDetailQueryKey,
  ]);

  const autoSubmitKey = `${qFromUrl}\u0000${hubRun}`;
  // MUST forward `options` (attachments) — a text-only wrapper silently drops
  // uploaded attachments. Attachment-only sends are valid.
  const submitMessage = useCallback<SubmitMessage>(
    (text, options) => {
      const trimmed = text.trim();
      if (!(trimmed || options?.attachments?.length)) {
        return;
      }
      setDraft("");
      session.submitMessage(trimmed, options);
    },
    [session]
  );

  const performFullSessionReset = useCallback(() => {
    setDraft("");
    autoSubmittedRef.current = null;
    pendingAutoSubmitKeyRef.current = null;
    session.reset();
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("thread_id");
        return next;
      },
      { replace: true }
    );
  }, [autoSubmittedRef, pendingAutoSubmitKeyRef, session, setSearchParams]);

  useEffect(() => {
    const autoSubmitMessage = qFromUrl.trim();
    if (
      !(
        kbContextReady &&
        isTransportReady &&
        autoSubmitMessage &&
        session.status === "ready" &&
        session.copilotMessages.length === 0 &&
        !session.pendingSend &&
        autoSubmittedRef.current !== autoSubmitKey
      )
    ) {
      return;
    }
    pendingAutoSubmitKeyRef.current = autoSubmitKey;
    submitMessage(autoSubmitMessage);
  }, [
    autoSubmitKey,
    autoSubmittedRef,
    isTransportReady,
    kbContextReady,
    pendingAutoSubmitKeyRef,
    qFromUrl,
    session.copilotMessages.length,
    session.pendingSend,
    session.status,
    submitMessage,
  ]);

  useEffect(() => {
    if (session.status !== "error" || !pendingAutoSubmitKeyRef.current) {
      return;
    }
    autoSubmittedRef.current = autoSubmitKey;
    pendingAutoSubmitKeyRef.current = null;
  }, [
    autoSubmitKey,
    autoSubmittedRef,
    pendingAutoSubmitKeyRef,
    session.status,
  ]);

  const panelStatus =
    session.awaitingInterrupt && session.status === "ready"
      ? "submitted"
      : session.status;

  const kbShellNav = useKbModuleSecondaryShellNav({
    kbId,
  });

  usePageConfig({
    contentStackBackground: "paper",
    actions: kbsLoading ? null : <KbModuleShellActions />,
    breadcrumbs: kbShellNav.kbRootCrumb
      ? [kbShellNav.kbRootCrumb, { label: t("hub.chat_breadcrumb") }]
      : [],
    secondaryNavAfterItems: kbShellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: kbShellNav.secondaryNavHeaderSlot,
  });

  if (kbsLoading || !kbId) {
    return (
      <section className={kbModulePageShellSectionClassName}>
        <Skeleton className="h-10 w-full max-w-xl" />
        <Skeleton className="mt-4 h-40 w-full" />
      </section>
    );
  }

  return (
    <div
      className={`${kbModulePageFillShellSectionClassName} relative w-full bg-transparent`}
    >
      <CopilotPanelContent
        agentDebugPayload={undefined}
        applyError={null}
        applySelectedLabel={tc("copilot.applySelected")}
        artifactError={null}
        artifactLoadFailedLabel={tc("copilot.artifactLoadFailed")}
        attachLabel={tc("copilot.position.sidebar")}
        autoScrollKey={session.activeThreadId ?? session.threadResetKey}
        awaitingInterrupt={session.awaitingInterrupt}
        bodyOnly
        cancelLabel={tc("copilot.cancel")}
        closeLabel={tc("copilot.position.heading")}
        composerDockStyle
        composerPlaceholder={tc("copilot.typeMessage")}
        composerWrapperClassName={CHAT_LANE_COMPOSER_CLASS}
        contentBodyGutter="flush"
        debugPayload={undefined}
        detachLabel={tc("copilot.position.floating")}
        draft={draft}
        emptyStateSubtitle={t("hub.chat_empty_subtitle")}
        emptyStateTitle={kbName}
        enableStatusFlap={false}
        error={session.error}
        isApplying={false}
        latestSuggestions={[]}
        messages={session.copilotMessages}
        minimalChrome
        onApplySuggestions={async () => {}}
        onCancel={() => {}}
        onClose={() => {}}
        onNewChat={() => {
          performFullSessionReset();
        }}
        onPanelModeChange={() => {}}
        onStop={session.cancel}
        openInterrupt={resolvedOpenInterrupt}
        optimisticInterruptResults={session.optimisticInterruptResults}
        panelMode="docked"
        pendingInterruptToolCallIds={session.pendingInterruptToolCallIds}
        pendingUserInsertIndex={session.pendingUserInsertIndex}
        pendingUserParts={session.pendingUserParts}
        pendingUserText={session.pendingUserText}
        positionMenu={<div aria-hidden className="hidden" />}
        respond={session.respond}
        reviewPromptLabel={tc("copilot.reviewPrompt")}
        selectedCountLabel={tc("copilot.selected")}
        selectedSuggestions={{}}
        setDraft={setDraft}
        setSelectedSuggestions={() => {}}
        starterPrompts={chatStarterPrompts}
        startMode="manual"
        status={panelStatus}
        submitMessage={submitMessage}
        suggestedUpdatesLabel={tc("copilot.suggestedUpdates")}
        thinkingLabel={tc("copilot.thinking")}
        transcriptContainerClassName={CHAT_LANE_TRANSCRIPT_CLASS}
        transcriptSurface="chat"
        triggerType="message_copilot"
      />
    </div>
  );
}
