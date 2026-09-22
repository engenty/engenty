"use client";

// The copilot's desk: the river drawn with the same frame a specialist's desk
// has — identity block and band, action row, settings / runs pane, browser
// and artefact panes, the chapters. What is the copilot's alone stays here:
// the thread is the river (one per person, bound by the shell-level
// `CopilotRiverProvider`, never chosen), realtime voice, `@agent` mentions
// that reach any agent, the sub-agent monitor (`?subRun=`), and — outside a
// space, where the page owns a column — the chapters as a rail.
//
// Inside a space the page is `/s/<key>/copilot` and the column is the
// space's; the crumb then names the copilot. Outside it is `/copilot` and the
// column is the copilot's own, so the crumb would say it twice.

import { spaceKeyFromPathname } from "@engenty/ai-core/browser";
import {
  ModuleSidebarHeaderLabel,
  useCopilotShellOrNull,
  useShellSecondaryNav,
} from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { BlobAvatar } from "@engenty/ui-core";
import { DockChatIcon } from "@engenty/ui-icons";
import type { PageBreadcrumb } from "@engenty/ui-plugin-sdk";
import { type ReactNode, useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ACTIVE_COPILOT_AGENT_ID,
  ENGENTY_COPILOT_HOST_KEY,
  useAgentHost,
} from "../../agent-provider/index.js";
import type { ChatSpaceAudience } from "../../components/copilot/chat-visibility.js";
import type { MentionRefSearch } from "../../components/copilot/composer/use-copilot-composer-mention.js";
import { openCopilotShell } from "../../components/copilot/drawer/copilot-drawer-utils.js";
import { SubAgentRunFullPage } from "../../components/copilot/sub-agent-run/sub-agent-run-full-page.js";
import { useCopilotRiver } from "../../copilot/copilot-river.js";
import {
  copilotRiverPath,
  readCopilotSubRunToolCallId,
} from "../../copilot/copilot-river-paths.js";
import { useCopilotVoice } from "../../copilot/copilot-voice-provider.js";
import {
  clearPendingHostMessage,
  resolvePendingHostMessage,
} from "../../copilot/host-message-handoff.js";
import { PendingHostMessageSubmit } from "../../copilot/pending-host-message-submit.js";
import { selectSubAgentDelegationFromMessages } from "../../copilot/sub-agent-run/select-sub-agent-delegation.js";
import {
  ThreadChapterCard,
  ThreadChaptersList,
  ThreadChaptersMenu,
} from "../../copilot/thread-chapters.js";
import { useMentionAgentCandidates } from "../../hooks/use-mention-agent-candidates.js";
import { AgentDeskActions } from "./agent-desk-actions.js";
import { AgentDeskChatPanel } from "./agent-desk-chat-panel.js";
import { DeskFrame, DeskMessage } from "./desk-frame.js";
import { useAgentDeskFeed } from "./use-agent-desk-feed.js";
import { useAgentDeskPanel } from "./use-agent-desk-panel.js";
import { useAgentDeskThread } from "./use-agent-desk-thread.js";
import { useDeskObjectDisplayIntent } from "./use-desk-object-display-intent.js";

export interface CopilotDeskSpace {
  id: string;
  key: string;
  name?: string | null;
}

export function CopilotDesk(props: {
  /** Composer control left of the attach (+) menu — the effort chooser. */
  composerLeadingControl?: ReactNode;
  /** `@` candidates — the space's people and other agents, as references. */
  mentionRefSearch?: MentionRefSearch;
  /** The space the page stands in — the URL's — or null on `/copilot`. */
  space: CopilotDeskSpace | null;
  spaceAudience?: ChatSpaceAudience | null;
}) {
  const { space } = props;
  const { i18n } = useTranslation("common");
  const { t } = useTranslation("ai-ui");
  const locale = i18n.language || "en";
  const river = useCopilotRiver();
  const hostKey = ENGENTY_COPILOT_HOST_KEY;
  const host = useAgentHost(hostKey);
  const deskThread = useAgentDeskThread(hostKey, river.threadId);
  const feedQuery = useAgentDeskFeed({
    agentId: ACTIVE_COPILOT_AGENT_ID,
    locale,
    spaceId: null,
  });
  const realtimeVoice = useCopilotVoice();
  const mentionAgentCandidates = useMentionAgentCandidates();
  const { closePanel, openPanel, panel } = useAgentDeskPanel();
  const location = useLocation();
  const navigate = useNavigate();
  const copilotShell = useCopilotShellOrNull();
  const { secondaryNavOpen } = useShellSecondaryNav();
  // Read from the PATHNAME: `space` may lag the URL by a query round trip,
  // and "am I inside a space" must not flicker with it.
  const inSpace = spaceKeyFromPathname(location.pathname) != null;
  const spaceKey = space?.key ?? null;
  const title = t("agentDesk.copilot.title");

  // A host-generic parked message (a module page's "ask the copilot") rides
  // in on `location.state`; once the turn is in the transcript the state is
  // cleared in place so a reload does not send it twice.
  const pendingSubmit = resolvePendingHostMessage(hostKey, location.state);
  const consumePendingSubmit = useCallback(() => {
    clearPendingHostMessage(hostKey);
    navigate(location.pathname + location.search, {
      replace: true,
      state: {},
    });
  }, [hostKey, location.pathname, location.search, navigate]);

  // A link that leaves for a module route opens the companion first, so the
  // same river is still there on the other side.
  const navigateFromChat = useCallback(
    (href: string) => {
      if (copilotShell) {
        openCopilotShell({
          mergeLayout: copilotShell.copilotLayout.mergeLayout,
          preferredDockMode: copilotShell.preferredDockMode,
          setOpen: copilotShell.setOpen,
          setPreferredDockMode: copilotShell.setPreferredDockMode,
        });
      }
      navigate(href);
    },
    [copilotShell, navigate]
  );
  const objectDisplayIntent = useDeskObjectDisplayIntent(hostKey, {
    navigateFromChat,
  });

  // `?subRun=` swaps the lane for the monitor view; same host, same river.
  const subRunToolCallId = readCopilotSubRunToolCallId(location.search);
  const subAgentDelegation = useMemo(
    () =>
      selectSubAgentDelegationFromMessages(
        host.copilotMessages,
        subRunToolCallId ?? ""
      ),
    [host.copilotMessages, subRunToolCallId]
  );

  const breadcrumbs = useMemo((): PageBreadcrumb[] => {
    // Outside a space the column carries the copilot's name when it is open
    // — the crumb would say it twice. Inside a space the column is the
    // space's, so the crumb has to name the copilot; it opens the settings.
    const trail: PageBreadcrumb[] =
      secondaryNavOpen && !inSpace
        ? []
        : [
            {
              compactKept: true,
              label: (
                <button
                  className="flex min-w-0 items-center gap-1.5 rounded-sm font-medium text-foreground text-sm hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  onClick={() => openPanel("manage")}
                  type="button"
                >
                  <BlobAvatar
                    character="ember"
                    className="[&_.blob-shadow]:hidden"
                    size={18}
                  />
                  <span className="min-w-0 truncate">{title}</span>
                </button>
              ),
              menuLabel: title,
            },
          ];
    if (subRunToolCallId && subAgentDelegation) {
      const agentName =
        subAgentDelegation.agentName || subAgentDelegation.agentId;
      trail.push({
        compactKept: true,
        label: (
          <span className="truncate text-muted-foreground" title={agentName}>
            {agentName}
          </span>
        ),
        menuLabel: agentName,
      });
    }
    return trail;
  }, [
    inSpace,
    openPanel,
    secondaryNavOpen,
    subAgentDelegation,
    subRunToolCallId,
    title,
  ]);

  const subRunLabels = useMemo(
    () => ({
      backToChat: t("agentDesk.subAgent.backToChat"),
      input: t("agentDesk.subAgent.input"),
      log: t("agentDesk.subAgent.log"),
      notFound: t("agentDesk.subAgent.notFound"),
      output: t("agentDesk.subAgent.output"),
      running: t("agentDesk.subAgent.running"),
    }),
    [t]
  );

  if (feedQuery.isPending) {
    return <DeskMessage>{t("agentDesk.loading")}</DeskMessage>;
  }
  if (feedQuery.isError || !feedQuery.data) {
    return (
      <DeskMessage tone="error">
        {feedQuery.error instanceof Error
          ? feedQuery.error.message
          : t("agentDesk.loadFailed")}
      </DeskMessage>
    );
  }
  const { agent } = feedQuery.data;

  return (
    <DeskFrame
      actions={
        <AgentDeskActions
          agentId={agent.id}
          agentName={agent.name}
          canAsk
          canAssignWork={false}
          canManage={false}
          chapters={<ThreadChaptersMenu threadId={river.threadId} />}
          hostKey={hostKey}
          isCustomAgent={false}
          locale={locale}
          onOpenPanel={openPanel}
          spaceId={space?.id ?? null}
          spaceKey={spaceKey}
          threadId={river.threadId}
        />
      }
      breadcrumbs={breadcrumbs}
      canEditPads
      canManage={false}
      chapterCard={<ThreadChapterCard threadId={river.threadId} />}
      chatIsConversation
      header={{
        agent,
        chatKind: "copilot",
        hostKey,
        lastActivityAt: deskThread.thread.session?.updated_at ?? null,
        spaceName: space?.name ?? null,
        visibility: "private",
      }}
      hostKey={hostKey}
      locale={locale}
      objectDisplayIntent={objectDisplayIntent}
      onClosePanel={closePanel}
      panel={panel}
      {...(inSpace
        ? {}
        : {
            secondaryNavAfterItems: (
              <ThreadChaptersList threadId={river.threadId} />
            ),
            secondaryNavHeaderSlot: (
              <ModuleSidebarHeaderLabel
                icon={DockChatIcon}
                label={title}
                to={copilotRiverPath()}
              />
            ),
          })}
      spaceAudience={props.spaceAudience}
      spaceId={space?.id ?? null}
      threadId={river.threadId}
      visibility="private"
    >
      {({ onTranscriptTopVisibility, scrollHeader }) =>
        subRunToolCallId ? (
          <SubAgentRunFullPage
            labels={subRunLabels}
            messages={host.copilotMessages}
            onBack={() => navigate(copilotRiverPath(spaceKey))}
            toolCallId={subRunToolCallId}
          />
        ) : (
          <>
            <PendingHostMessageSubmit
              hostKey={hostKey}
              isLoadingMessages={deskThread.isLoadingMessages}
              message={pendingSubmit}
              onConsumed={consumePendingSubmit}
            />
            <AgentDeskChatPanel
              agentConnectors={agent.connectors}
              agentDescription={agent.description}
              agentEngenty={agent.engenty}
              agentId={agent.id}
              agentName={agent.name}
              agentRole={agent.role}
              agentScope={agent.agentScope}
              agentSkills={agent.skills}
              agentStarters={agent.starters}
              composerLeadingControl={props.composerLeadingControl}
              composerPlaceholder={t("agentDesk.copilot.composerPlaceholder")}
              contextPane={false}
              emptyStateSubtitle={t("agentDesk.copilot.emptyStateSubtitle")}
              emptyStateTitle={t("agentDesk.copilot.emptyStateTitle")}
              hostKey={hostKey}
              initialMessages={deskThread.initialMessages}
              isLoadingMessages={deskThread.isLoadingMessages}
              mentionAgentCandidates={mentionAgentCandidates}
              mentionRefSearch={props.mentionRefSearch}
              olderMessages={deskThread.olderMessages}
              onTranscriptTopVisibility={onTranscriptTopVisibility}
              openInterruptFromSession={deskThread.openInterruptFromSession}
              realtimeVoice={realtimeVoice}
              scrollHeader={scrollHeader}
              spaceId={null}
              thread={deskThread.thread.session}
            />
          </>
        )
      }
    </DeskFrame>
  );
}
