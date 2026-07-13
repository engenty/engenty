/**
 * Knowledge base scoped chat — full AI session with the KB manager agent.
 * Reached from the KB hub when the user submits a 3-word+ question.
 * A `?q=` param is auto-submitted on first load. Optional `?chat_kb=` is `all` or a KB id.
 */

import {
  appsAiThreadDetailQueryKey,
  appsAiThreadMessagesQueryKey,
  CopilotPanelContent,
  type CopilotRouteContext,
  EngentyAgent,
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
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  KbChatKbScopeControl,
  type KbChatScopeValue,
} from "../components/kb-chat-kb-scope-control.js";
import { KbModuleShellActions } from "../components/kb-module-shell-actions.js";
import { useKbModuleSecondaryShellNav } from "../hooks/use-kb-module-secondary-shell-nav.js";
import { kbDisplayName } from "../kb-display-name.js";
import {
  KB_MODULE_BASE,
  kbHubPath,
  searchStringWithoutKbId,
} from "../kb-paths.js";
import {
  kbModulePageFillShellSectionClassName,
  kbModulePageShellSectionClassName,
} from "../lib/kb-page-shell.js";
import { kbSettingsQueryOptions, kbsQueryOptions } from "../queries.js";
import {
  kbIdFromSlug,
  resolveKbIdFromUrl,
  slugFromKbId,
  tenantDefaultKbId,
} from "../resolve-kb-id.js";

/** Scoped read-only agent for the KB hub chat surface. */
const KB_ANSWERS_AGENT_ID = "knowledge-base.answers";

/** URL-only launch identity — excludes `kbId` so client nav does not reset mid-submit when KB resolves. */
function resolveKbHubLaunchKey(params: {
  chatKbParam: string;
  hubRun: string;
  qFromUrl: string;
}): string {
  return `${params.hubRun}\u0000${params.chatKbParam}\u0000${params.qFromUrl}`;
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
  const { kbSlug: kbSlugParam } = useParams<{ kbSlug?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const qFromUrl = searchParams.get("q") ?? "";
  const chatKbParam = searchParams.get("chat_kb")?.trim() ?? "";
  const hubRun = searchParams.get("hub_run")?.trim() ?? "";

  const { data: kbs = [], isLoading: kbsLoading } = useQuery(kbsQueryOptions);
  const { data: kbSettings } = useQuery(kbSettingsQueryOptions);
  const tenantDefault = tenantDefaultKbId(kbSettings);

  const kbId = useMemo(() => {
    if (kbSlugParam?.trim()) {
      return kbIdFromSlug(kbs, kbSlugParam);
    }
    return resolveKbIdFromUrl(searchParams, kbs, tenantDefault);
  }, [kbSlugParam, searchParams, kbs, tenantDefault]);

  const kbSlug = useMemo(() => slugFromKbId(kbs, kbId), [kbs, kbId]);

  const resolvedChatKbScope = useMemo((): KbChatScopeValue => {
    if (chatKbParam === "all") {
      return "all";
    }
    if (chatKbParam && kbs.some((k) => k.id === chatKbParam)) {
      return chatKbParam;
    }
    return kbId;
  }, [chatKbParam, kbs, kbId]);

  const [chatKbScope, setChatKbScope] =
    useState<KbChatScopeValue>(resolvedChatKbScope);

  useEffect(() => {
    setChatKbScope(resolvedChatKbScope);
  }, [resolvedChatKbScope]);

  useEffect(() => {
    if (kbsLoading || kbs.length === 0) {
      return;
    }
    const rest = searchStringWithoutKbId(searchParams);
    if (kbSlugParam?.trim() && !kbIdFromSlug(kbs, kbSlugParam)) {
      navigate(`${KB_MODULE_BASE}${rest}`, { replace: true });
      return;
    }
    if (!kbSlugParam) {
      const targetKbId = resolveKbIdFromUrl(searchParams, kbs, tenantDefault);
      const targetSlug = slugFromKbId(kbs, targetKbId);
      if (targetSlug) {
        navigate(`${kbHubPath(targetSlug)}${rest}`, { replace: true });
      }
    }
  }, [kbsLoading, kbs, kbSlugParam, searchParams, navigate, tenantDefault]);

  const activeKb = kbs.find((k) => k.id === kbId);
  const kbName = activeKb ? kbDisplayName(activeKb, t) : t("hub.title");

  const copilotScope = useMemo(() => {
    const isAll = chatKbScope === "all";
    return {
      ui_language: uiLanguage,
      current_module: "knowledge-base",
      kb_chat_scope: isAll ? "all" : "single",
      kb_id: isAll ? null : chatKbScope,
      ...(hubRun ? { hub_run: hubRun } : {}),
    };
  }, [uiLanguage, chatKbScope, hubRun]);

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
    chatKbParam,
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
  const kbContextReady = !kbsLoading && Boolean(kbId && kbSlug);

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

  const autoSubmitKey = `${qFromUrl}\u0000${chatKbParam}\u0000${hubRun}`;
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
    kbSlug: kbSlug ?? "",
  });

  usePageConfig({
    topbarChrome: "contentBlend",
    contentStackBackground: "paper",
    actions:
      kbSlug && !kbsLoading ? <KbModuleShellActions kbSlug={kbSlug} /> : null,
    breadcrumbs: kbShellNav.kbRootCrumb
      ? [kbShellNav.kbRootCrumb, { label: t("hub.chat_breadcrumb") }]
      : [],
    secondaryNavAfterItems: kbShellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: kbShellNav.secondaryNavHeaderSlot,
  });

  if (kbsLoading || !kbId || !kbSlug) {
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
        bodyOnly
        cancelLabel={tc("copilot.cancel")}
        composerDockStyle
        composerLeadingControl={
          <KbChatKbScopeControl
            kbs={kbs}
            kbsLoading={kbsLoading}
            onKbChange={setChatKbScope}
            selected={chatKbScope}
          />
        }
        composerPlaceholder={tc("copilot.typeMessage")}
        composerWrapperClassName="mx-auto w-full max-w-[42rem]"
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
        panelMode="docked"
        pendingUserInsertIndex={session.pendingUserInsertIndex}
        pendingUserText={session.pendingUserText}
        positionMenu={<div aria-hidden className="hidden" />}
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
        transcriptContainerClassName="mx-auto w-full max-w-[42rem] gap-4"
        transcriptSurface="chat"
        triggerType="message_copilot"
      />
    </div>
  );
}
