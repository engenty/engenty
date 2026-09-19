"use client";

import type {
  AgentDeskAgent,
  AgentDeskCapabilityChip,
  AgentDeskStarter,
} from "@engenty/ai-core/browser";
import { useCopilotShellOrNull } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { Eye } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";
import { isAwaitingAgUiInitialHydrate } from "../../ag-ui/conversation.js";
import { useAgentHost } from "../../agent-provider/index.js";
import { CHAT_LANE_COLUMN_CLASS } from "../../components/copilot/chat-lane/chat-lane-layout.js";
import {
  ChatLaneDock,
  chatLanePanelBaseProps,
  useChatLaneComposer,
} from "../../components/copilot/chat-lane/index.js";
import type { ChatSlashCommand } from "../../components/copilot/composer/copilot-slash-command.js";
import type { MentionRefSearch } from "../../components/copilot/composer/use-copilot-composer-mention.js";
import { CopilotDrawerPositionMenu } from "../../components/copilot/drawer/copilot-drawer-position-menu.js";
import { normalizeCopilotPositionMenuValue } from "../../components/copilot/drawer/copilot-drawer-utils.js";
import { CopilotPanelContent } from "../../components/copilot/panel/copilot-panel-content.js";
import type { CopilotPanelContentProps } from "../../components/copilot/panel/copilot-panel-content-types.js";
import { ThreadContextPane } from "../../components/copilot/thread-context/thread-context-pane.js";
import { TranscriptLoadOlder } from "../../components/copilot/transcript/transcript-load-older.js";
import { registerCopilotComposerDraftSetter } from "../../copilot/copilot-composer-draft-intent.js";
import { useChatSlashCommands } from "../../hooks/use-chat-slash-commands.js";
import { isThreadWritableByViewer } from "../../threads/thread-write-access.js";
import { TEMPORARY_ENGENTY_THREAD_ID_PREFIX } from "../../threads/use-engenty-threads.js";
import { transcriptShowsSenderLabels } from "../space-chats/space-chats-model.js";
import {
  agentDeskEmptyStarters,
  mergeAgentDeskStarters,
} from "./agent-desk-empty-starters.js";
import { AgentDeskRunActivity } from "./agent-desk-run-activity.js";
import { TranscriptTopSentinel } from "./transcript-top-sentinel.js";

/**
 * The identity block's top: its topbar clearance (`pt-20`), the name and the
 * tier row under it. The band replaces exactly these, so it comes up once
 * they have scrolled away — not while the name is still half in view.
 */
const IDENTITY_TOP_SENTINEL_PX = 152;

import { useAgentDeskGeneratedStarters } from "./use-agent-desk-feed.js";
import type { useAgentDeskThread } from "./use-agent-desk-thread.js";

/**
 * An Engenty's chat, drawn as the same lane the copilot chat is.
 *
 * Everything the composer does — the column measure, drafts, the queue, docked
 * approvals — comes from the shared chat-lane base, so the two surfaces cannot
 * drift. Realtime voice stays Copilot-only for now (Engenties still have no
 * voice tools). Position chrome is the same Work / Window / Talk menu the
 * Copilot uses, so a hired Engenty can leave this Talk page for the side panel.
 *
 * Slash commands and @-mentions are shared, scoped to this desk: the command
 * catalog is narrowed to this agent and its own skills, and `@` offers the
 * Space's colleagues (people and other agents) as references — never a lane
 * switch, since this lane belongs to one agent. The colleague list needs the
 * app's Space queries, so the host injects it like the effort chooser.
 */
export function AgentDeskChatPanel(props: {
  agentConnectors: AgentDeskCapabilityChip[];
  agentDescription: string | null;
  agentEngenty: AgentDeskAgent["engenty"];
  agentId: string;
  agentName: string;
  agentRole: AgentDeskAgent["role"];
  agentScope?: AgentDeskAgent["agentScope"];
  agentSkills: AgentDeskCapabilityChip[];
  agentStarters: AgentDeskStarter[];
  /** Composer control left of the attach (+) menu — the effort chooser. */
  composerLeadingControl?: ReactNode;
  /** The composer's hint; the agent's name when absent. A room names itself. */
  composerPlaceholder?: string;
  /**
   * Identity (and similar) that scrolls with the transcript, not a block
   * above it — so the header cannot fight the chat scroller on height.
   */
  scrollHeader?: ReactNode;
  /**
   * Work / Window: bottom-docked composer, no desk empty-landing squeeze.
   */
  companion?: boolean;
  /** False when the surface around this chat lays the context card out itself. */
  contextPane?: boolean;
  hostKey: string;
  /** Fires when the top of the transcript scrolls out of, or back into, view. */
  onTranscriptTopVisibility?: (visible: boolean) => void;
  initialMessages: ReturnType<typeof useAgentDeskThread>["initialMessages"];
  isLoadingMessages: boolean;
  /** `@` candidates — the Space's people and other agents, as references. */
  mentionRefSearch?: MentionRefSearch;
  olderMessages: ReturnType<typeof useAgentDeskThread>["olderMessages"];
  openInterruptFromSession: ReturnType<
    typeof useAgentDeskThread
  >["openInterruptFromSession"];
  spaceId: string;
  /**
   * Whether an empty chat offers the agent's starters. A room does not: its
   * openers are the host's, written for a person alone with it.
   */
  starters?: boolean;
  thread: ReturnType<typeof useAgentDeskThread>["thread"]["session"];
}) {
  const { t } = useTranslation("ai-ui");
  const withStarters = props.starters ?? true;
  const { i18n, t: tc } = useTranslation("common");
  const { currentTenant, currentUserId } = useWorkspaceContext();
  const host = useAgentHost(props.hostKey);
  const shell = useCopilotShellOrNull();
  const locale = i18n.language || "en";
  const slashBuiltins = useMemo<ChatSlashCommand[]>(
    () => [
      {
        command: "help",
        description: t("agentDesk.commands.help"),
        group: "Core",
        kind: "ui",
      },
    ],
    [t]
  );
  const skillIds = useMemo(
    () => props.agentSkills.map((skill) => skill.id),
    [props.agentSkills]
  );
  const slashCommands = useChatSlashCommands({
    agentId: props.agentId,
    builtins: slashBuiltins,
    skillIds,
  });
  const catalogueStarters = useMemo(
    () => agentDeskEmptyStarters(tc, { starters: props.agentStarters }),
    [props.agentStarters, tc]
  );
  const generatedQuery = useAgentDeskGeneratedStarters({
    agentId: props.agentId,
    enabled: withStarters && host.copilotMessages.length === 0,
    locale,
    spaceId: props.spaceId,
  });
  const starterPrompts = useMemo(
    () =>
      withStarters
        ? mergeAgentDeskStarters(
            catalogueStarters,
            generatedQuery.data?.enabled === true
              ? generatedQuery.data.starters
              : undefined
          )
        : [],
    [catalogueStarters, generatedQuery.data, withStarters]
  );
  const threadKey =
    host.threadId ??
    `${TEMPORARY_ENGENTY_THREAD_ID_PREFIX}${host.threadResetKey}`;
  const status =
    host.pendingSend && host.status === "ready" ? "submitted" : host.status;
  const lane = useChatLaneComposer({
    host,
    messages: host.copilotMessages,
    openInterruptFromSession: props.openInterruptFromSession,
    status,
    tenantId: currentTenant?.id ?? "",
    threadKey,
    userId: currentUserId ?? "",
  });
  // Object panels and widgets prefill THIS composer ("Ask the agent to…") the
  // same way module pages prefill the copilot's — keyed by host, so a record
  // opened beside the desk talks to the Engenty whose desk it is.
  useEffect(
    () => registerCopilotComposerDraftSetter(props.hostKey, lane.setDraft),
    [lane.setDraft, props.hostKey]
  );
  // A run this window attached to is someone else's turn (a colleague's in a
  // room, another window's): the composer stays a Send, not a Stop, and the
  // lane steers the words into that run (Grok Bot's "redirect the current
  // turn"). The lane itself keeps the true status — that is what makes it
  // steer instead of start.
  const composerStatus = host.attachedRunId ? "ready" : status;

  // Any non-null dock is a visible composer flap — pass null when idle.
  const dockedInterruptSurface =
    lane.queue.hasQueued || lane.dockInterrupt ? (
      <ChatLaneDock
        dockInterrupt={lane.dockInterrupt}
        host={host}
        labels={{
          drag: t("agentDesk.queue.drag"),
          edit: t("agentDesk.queue.edit"),
          remove: t("agentDesk.queue.remove"),
          sendNow: t("agentDesk.queue.sendNow"),
          title: t("agentDesk.queue.title"),
        }}
        onEditQueued={lane.editQueuedMessage}
        onSandboxCommandApprove={lane.onSandboxCommandApprove}
        onSandboxCommandReject={lane.onSandboxCommandReject}
        queue={lane.queue}
      />
    ) : null;
  const isReadOnlyThread = !isThreadWritableByViewer(
    props.thread,
    currentUserId
  );
  const transcriptLoading =
    props.isLoadingMessages ||
    isAwaitingAgUiInitialHydrate({
      currentMessages: host.messages,
      initialMessages: props.initialMessages,
      suppressHydration: host.status !== "ready",
    });
  // An empty chat shows the landing instead of the transcript, so the top
  // sentinel never mounts. The identity block is in view there (below), so
  // the desk must hear "top visible" or the band from a bound thread stays up.
  const transcriptEmpty =
    host.copilotMessages.length === 0 && !transcriptLoading;
  const onTranscriptTopVisibility = props.onTranscriptTopVisibility;
  const boundThreadId = host.threadId;
  useEffect(() => {
    if (transcriptEmpty) {
      onTranscriptTopVisibility?.(true);
    }
    // Re-said on every thread switch: the desk resets the band per thread.
  }, [boundThreadId, onTranscriptTopVisibility, transcriptEmpty]);
  const panelProps: CopilotPanelContentProps = {
    ...chatLanePanelBaseProps(tc),
    autoScrollKey: host.threadId ?? host.threadResetKey,
    awaitingInterrupt: host.awaitingInterrupt,
    composerFocusKey: host.threadResetKey,
    composerLeadingControl: props.composerLeadingControl,
    composerOverride: isReadOnlyThread ? (
      <ReadOnlyThreadNotice label={t("agentDesk.readOnlyThread")} />
    ) : undefined,
    composerPlaceholder:
      props.composerPlaceholder ??
      t("agentDesk.composerPlaceholder", { name: props.agentName }),
    dismissInterrupt: host.dismissInterrupt,
    dockedInterruptSurface,
    dockedInterruptToolCallId: lane.dockInterrupt?.tool_call_id ?? null,
    draft: lane.draft,
    ...(props.companion
      ? { centerEmptyLanding: false as const }
      : { emptyLandingAlign: "start" as const }),
    // The agent's identity heads the transcript (AgentDeskHeader) — but an
    // empty chat hides the transcript for the landing, so the landing shows
    // the same block at the top of the lane, where the transcript would put
    // it. A companion pane has no room for it.
    emptyStateHeader:
      props.companion || !props.scrollHeader ? undefined : (
        <div className={CHAT_LANE_COLUMN_CLASS}>{props.scrollHeader}</div>
      ),
    engentyKind: props.agentEngenty,
    error: host.error,
    mentionRefSearch: props.mentionRefSearch,
    messages: host.copilotMessages,
    onCancel: lane.stopAndClearQueue,
    onSandboxCommandApprove: lane.onSandboxCommandApprove,
    onSandboxCommandReject: lane.onSandboxCommandReject,
    onStop: lane.stopAndClearQueue,
    openInterrupt: lane.openInterrupt,
    optimisticInterruptResults: host.optimisticInterruptResults,
    pendingInterruptToolCallIds: host.pendingInterruptToolCallIds,
    pendingUserInsertIndex: host.pendingUserInsertIndex,
    pendingUserParts: host.pendingUserParts,
    pendingUserText: host.pendingUserText,
    positionMenu: shell ? (
      <CopilotDrawerPositionMenu
        onSelectDockPosition={(mode) => {
          shell.setPreferredDockMode(mode);
          shell.setOpen(true);
        }}
        positionDrawerLabel={tc("copilot.position.drawer")}
        positionFullscreenLabel={tc("copilot.position.fullscreen")}
        positionHeadingLabel={tc("copilot.position.heading")}
        positionMenuAriaLabel={tc("copilot.position.menu")}
        positionSidebarLabel={tc("copilot.position.sidebar")}
        positionWindowLabel={tc("copilot.position.window")}
        value={normalizeCopilotPositionMenuValue(
          shell.preferredDockMode,
          shell.dockMode
        )}
      />
    ) : (
      <div aria-hidden className="hidden" />
    ),
    respond: host.respond,
    selectedSuggestions: NO_SELECTION,
    setDraft: lane.setDraft,
    setSelectedSuggestions: noop,
    showAuthorLabels: transcriptShowsSenderLabels({
      agentScope: props.agentScope,
      routeContext: props.thread?.route_context ?? null,
    }),
    slashCommands,
    starterPrompts,
    status: composerStatus,
    // Reasoning/tool deltas don't change `messages` — feed raw stream activity
    // so the no-response guard never errors a live run.
    streamActivityCount: host.events.length,
    submitMessage: lane.submitMessage,
    // "Wird gesendet…" is true only until the run picks the message up: the
    // optimistic bubble stays for the whole turn, so reading `pendingSend`
    // alone left it claiming to send while the agent was already answering.
    thinkingLabel:
      composerStatus === "submitted"
        ? t("agentDesk.sending")
        : tc("copilot.thinking"),
    threadId: host.threadId,
    // Work this agent started on its own belongs at the end of the transcript,
    // not on a tab you have to know to open: a routine fire is the agent
    // working, and the room should say so while it happens.
    transcriptHeader: (
      <>
        {/* Not while the landing shows: the transcript is then mounted but
            hidden, and a hidden sentinel reports "scrolled away" — which
            would put the band up over the identity block. */}
        {props.onTranscriptTopVisibility && !transcriptEmpty ? (
          <TranscriptTopSentinel
            heightPx={props.scrollHeader ? IDENTITY_TOP_SENTINEL_PX : undefined}
            onVisibilityChange={props.onTranscriptTopVisibility}
          />
        ) : null}
        {props.scrollHeader}
        <TranscriptLoadOlder olderMessages={props.olderMessages} />
      </>
    ),
    transcriptFooter: (
      <AgentDeskRunActivity
        agentId={props.agentId}
        locale={locale}
        spaceId={props.spaceId}
        threadId={host.threadId}
      />
    ),
    transcriptLoading,
  };

  const laneNode = (
    <div
      // No top clearance any more: the desk header is a real header now, so
      // the topbar no longer overlaps this lane.
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    >
      <CopilotPanelContent {...panelProps} />
    </div>
  );
  // The desk lays the context card out as its own column beside header AND
  // chat; only a surface without that frame (a room page) floats it here.
  if (props.contextPane === false) {
    return laneNode;
  }
  return (
    <ThreadContextPane hostKey={props.hostKey}>{laneNode}</ThreadContextPane>
  );
}

function ReadOnlyThreadNotice({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/40 px-4 py-3 text-muted-foreground text-sm">
      <Eye aria-hidden className="size-4 shrink-0" />
      <span>{label}</span>
    </div>
  );
}

/** No inline HITL suggestion cards on a specialist lane. */
const NO_SELECTION: Record<string, boolean> = {};

function noop() {}
