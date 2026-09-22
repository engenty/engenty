"use client";

import type { AgentTurnMessageLike } from "@engenty/ag-ui-bridge";
import type {
  AgentDeskAgent,
  AgentDeskCapabilityChip,
  AgentDeskStarter,
} from "@engenty/ai-core/browser";
import { useCopilotShellOrNull } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { useQueryClient } from "@engenty/query-client";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { Eye, ListChecks } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { isAwaitingAgUiInitialHydrate } from "../../ag-ui/conversation.js";
import { useAgentHost } from "../../agent-provider/index.js";
import { CHAT_LANE_COLUMN_CLASS } from "../../components/copilot/chat-lane/chat-lane-layout.js";
import {
  ChatLaneDock,
  chatLanePanelBaseProps,
  useChatLaneComposer,
} from "../../components/copilot/chat-lane/index.js";
import type { StarterPromptItem } from "../../components/copilot/composer/copilot-composer.js";
import type { PressWizardCommandRequest } from "../../components/copilot/composer/copilot-composer-section.js";
import type { ChatSlashCommand } from "../../components/copilot/composer/copilot-slash-command.js";
import type { MentionRefSearch } from "../../components/copilot/composer/use-copilot-composer-mention.js";
import { CopilotDrawerPositionMenu } from "../../components/copilot/drawer/copilot-drawer-position-menu.js";
import { normalizeCopilotPositionMenuValue } from "../../components/copilot/drawer/copilot-drawer-utils.js";
import { CopilotPanelContent } from "../../components/copilot/panel/copilot-panel-content.js";
import type { CopilotPanelContentProps } from "../../components/copilot/panel/copilot-panel-content-types.js";
import { ThreadContextPane } from "../../components/copilot/thread-context/thread-context-pane.js";
import { formatCopilotThreadCopyText } from "../../components/copilot/transcript/copilot-thread-copy.js";
import { TranscriptLoadOlder } from "../../components/copilot/transcript/transcript-load-older.js";
import { registerCopilotComposerDraftSetter } from "../../copilot/copilot-composer-draft-intent.js";
import { useChatSlashCommands } from "../../hooks/use-chat-slash-commands.js";
import { isThreadWritableByViewer } from "../../threads/thread-write-access.js";
import { TEMPORARY_ENGENTY_THREAD_ID_PREFIX } from "../../threads/use-engenty-threads.js";
import { useBrowserWorkOpensPane } from "../browser/browser-work-opens-pane.js";
import { transcriptShowsSenderLabels } from "../space-chats/space-chats-model.js";
import { pressWizardCommand } from "../wizard/press-wizard-command.js";
import { useDeskWizardStep } from "../wizard/use-desk-wizard-step.js";
import { useWizardOutcomeRecord } from "../wizard/use-wizard-outcome-record.js";
import { WizardDock } from "../wizard/wizard-dock.js";
import {
  useCancelRunMutation,
  useResumeRunMutation,
} from "../workflow-canvas/workflow-queries.js";
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

import {
  agentDeskKeys,
  useAgentDeskGeneratedStarters,
} from "./use-agent-desk-feed.js";
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
 *
 * A graph run parked at a step — a routine fire, or a wizard pressed from
 * this composer — docks its step above the composer. While it is docked the
 * composer answers the step: free text resumes it when the step takes text,
 * otherwise the composer yields to a hint until the step is answered or the
 * run cancelled.
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
  /** `@agent` candidates — the copilot's, which can address any agent. */
  mentionAgentCandidates?: CopilotPanelContentProps["mentionAgentCandidates"];
  /** The empty chat's greeting; the desk's own when absent. */
  emptyStateSubtitle?: string;
  emptyStateTitle?: string;
  /**
   * Realtime voice (the copilot's): its turns splice into the transcript,
   * its call strip replaces the composer while a session runs, and its
   * control sits beside the effort chooser.
   */
  realtimeVoice?: {
    composerLeadingControl?: ReactNode;
    composerOverride?: ReactNode;
    session: { isActive: boolean };
    transcriptMessages: readonly (AgentTurnMessageLike & { id: string })[];
  };
  /**
   * The companion's chrome — its header (title, context switcher, browser
   * toggle, close / position) and body style — laid over the lane's own
   * props last. The desk page sets none of it; the drawer sets all of it.
   */
  companionChrome?: Partial<
    Pick<
      CopilotPanelContentProps,
      | "attachLabel"
      | "bodyOnly"
      | "browserPanel"
      | "browserPanelLabel"
      | "browserPanelOpen"
      | "centerEmptyLanding"
      | "chatKind"
      | "closeLabel"
      | "compactContextControl"
      | "contextMenuLabel"
      | "contextOptions"
      | "detachLabel"
      | "headerChrome"
      | "headerVariant"
      | "onClose"
      | "onPanelModeChange"
      | "onSelectContext"
      | "onToggleBrowserPanel"
      | "panelMode"
      | "positionMenu"
      | "recentContextMenuLabel"
      | "recentContextOptions"
      | "routeStatusLabel"
      | "selectedContextId"
      | "title"
    >
  >;
  /** Bumped to focus the composer from outside (the blob's Prompt, Work focus). */
  composerFocusToken?: number;
  /** After a sandbox command is approved — the page it came from refreshes. */
  onSandboxApproved?: () => void;
  /** Null on the copilot's desk outside a space: no wizards, no run feed. */
  spaceId: string | null;
  /** The surface's own openers, in place of the agent's (a module's copilot contribution). */
  starterPromptsOverride?: StarterPromptItem[];
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
  // The person's browser comes into view as soon as the agent starts using it.
  useBrowserWorkOpensPane(host.events);
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
    enabled:
      withStarters &&
      props.spaceId !== null &&
      host.copilotMessages.length === 0,
    locale,
    spaceId: props.spaceId ?? "",
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
  // Live voice turns are spliced into the transcript the panel renders, so
  // the lane must read the same list when it looks for a parked chooser.
  const voiceTurns = props.realtimeVoice?.transcriptMessages;
  const messages = useMemo(
    () =>
      voiceTurns && voiceTurns.length > 0
        ? [...host.copilotMessages, ...voiceTurns]
        : host.copilotMessages,
    [host.copilotMessages, voiceTurns]
  );
  const status =
    host.pendingSend && host.status === "ready" ? "submitted" : host.status;

  // A wizard this composer pressed: its run id is watched ahead of whatever
  // the fire discovery finds, since a press has no routine to be found by.
  const [pressedRunId, setPressedRunId] = useState<string | null>(null);
  // The press itself is a round trip; the dock says "Startet…" from the click
  // rather than from the run id, so a slash command answers immediately.
  const [pressPending, setPressPending] = useState(false);
  const queryClient = useQueryClient();
  const wizardStep = useDeskWizardStep({
    agentId: props.agentId,
    pressedRunId,
  });
  // A wizard that wrote a record opens it in the desk's pane, the same way
  // the wizard page opens it beside its last step.
  useWizardOutcomeRecord({
    hostKey: props.hostKey,
    settled: wizardStep?.state === "settled",
    summary: wizardStep?.summary,
  });
  const resumeRun = useResumeRunMutation();
  const cancelRun = useCancelRunMutation();
  const invalidateDeskFeed = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: agentDeskKeys.feed(props.spaceId, props.agentId, locale),
    });
  }, [locale, props.agentId, props.spaceId, queryClient]);
  const wizardGate = wizardStep?.gate ?? null;
  const submitUtterance = useCallback(
    (text: string) => {
      if (!(wizardStep && wizardGate)) {
        return;
      }
      resumeRun.mutate(
        {
          approved: true,
          data: { ...(wizardGate.surface.data ?? {}), utterance: text },
          event: "utterance",
          runId: wizardStep.runId,
          step_id: wizardGate.stepId,
          step_path: wizardGate.path,
        },
        { onSuccess: wizardStep.refetch }
      );
    },
    [resumeRun.mutate, wizardGate, wizardStep]
  );
  const dockedGate = useMemo(
    () =>
      wizardGate
        ? { acceptsText: wizardGate.accepts_text, submitUtterance }
        : null,
    [submitUtterance, wizardGate]
  );

  const lane = useChatLaneComposer({
    dockedGate,
    host,
    messages,
    onSandboxApproved: props.onSandboxApproved,
    openInterruptFromSession: props.openInterruptFromSession,
    status,
    tenantId: currentTenant?.id ?? "",
    threadKey,
    userId: currentUserId ?? "",
  });

  // `/command` for a wizard: press it here, no agent turn. The run's first
  // step then docks through the same hook a routine fire's would.
  const spaceId = props.spaceId;
  const onPressWizardCommand = useCallback(
    (request: PressWizardCommandRequest) => {
      if (!spaceId) {
        // A wizard runs in a space; outside one the command has nowhere to go.
        return;
      }
      setPressPending(true);
      void pressWizardCommand({
        argsText: request.argsText,
        command: request.command,
        refs: request.refs,
        spaceId,
        workflowId: request.command.workflowId,
      })
        .then((result) => {
          setPressedRunId(result.run_id);
          invalidateDeskFeed();
        })
        .catch(() => {
          // The press is refused (missing input, no such workflow): nothing
          // docks, and the composer keeps the draft for a retry.
        })
        .finally(() => setPressPending(false));
    },
    [invalidateDeskFeed, spaceId]
  );
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

  // The pressed wizard, drawn once above the composer: its step, the wait
  // between steps, or its closing line. Cancel stops the run for good and
  // refreshes the feed, where the settled thread now lists.
  const dockedWizardStep =
    wizardStep || pressPending ? (
      <WizardDock
        busy={resumeRun.isPending || cancelRun.isPending}
        objectSearch={props.mentionRefSearch ?? null}
        onCancel={() => {
          if (!wizardStep) {
            return;
          }
          cancelRun.mutate(wizardStep.runId, {
            onSuccess: () => {
              setPressedRunId(null);
              wizardStep.refetch();
              invalidateDeskFeed();
            },
          });
        }}
        onDismiss={() => {
          setPressedRunId(null);
          invalidateDeskFeed();
        }}
        onSubmit={(decision) => {
          const gate = wizardStep?.gate;
          if (!(wizardStep && gate)) {
            return;
          }
          resumeRun.mutate(
            {
              ...decision,
              runId: wizardStep.runId,
              step_id: gate.stepId,
              step_path: gate.path,
            },
            { onSuccess: wizardStep.refetch }
          );
        }}
        step={wizardStep}
      />
    ) : null;
  // Any non-null dock is a visible composer flap — pass null when idle.
  const dockedInterruptSurface =
    lane.queue.hasQueued || lane.dockInterrupt || dockedWizardStep ? (
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
        wizardStep={dockedWizardStep}
      />
    ) : null;
  const isReadOnlyThread = !isThreadWritableByViewer(
    props.thread,
    currentUserId
  );
  // A docked step that takes no free text owns the composer's place: the
  // hint says what to do instead, and nothing typed can reach the agent.
  const composerOverride = isReadOnlyThread ? (
    <ReadOnlyThreadNotice label={t("agentDesk.readOnlyThread")} />
  ) : wizardGate && !wizardGate.accepts_text ? (
    <ReadOnlyThreadNotice
      icon={ListChecks}
      label={t("agentDesk.wizard.answerOrCancel")}
    />
  ) : (
    props.realtimeVoice?.composerOverride
  );
  const threadCopyText = useMemo(
    () => formatCopilotThreadCopyText(messages),
    [messages]
  );
  const handleCopyThread = useCallback(async () => {
    if (threadCopyText) {
      await navigator.clipboard.writeText(threadCopyText);
    }
  }, [threadCopyText]);
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
    composerFocusKey: `${host.threadResetKey}:${props.composerFocusToken ?? 0}`,
    composerLeadingControl: props.realtimeVoice?.composerLeadingControl ? (
      <div className="flex min-w-0 items-center gap-1">
        {props.composerLeadingControl}
        {props.realtimeVoice.composerLeadingControl}
      </div>
    ) : (
      props.composerLeadingControl
    ),
    composerOverride,
    composerPlaceholder: wizardGate
      ? t("agentDesk.wizard.utterancePlaceholder")
      : (props.composerPlaceholder ??
        t("agentDesk.composerPlaceholder", { name: props.agentName })),
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
    ...(props.emptyStateSubtitle
      ? { emptyStateSubtitle: props.emptyStateSubtitle }
      : {}),
    ...(props.emptyStateTitle
      ? { emptyStateTitle: props.emptyStateTitle }
      : {}),
    engentyKind: props.agentEngenty,
    error: host.error,
    mentionAgentCandidates: props.mentionAgentCandidates,
    mentionRefSearch: props.mentionRefSearch,
    messages,
    onPressWizardCommand,
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
        canCopyThread={threadCopyText.length > 0}
        copyThreadCopiedLabel={tc("copilot.copyThreadCopied")}
        copyThreadLabel={tc("copilot.copyThread")}
        onCopyThread={handleCopyThread}
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
    resumeInterrupt: (feedback) =>
      host.resumeInterrupt({
        artifactId: feedback.artifactId,
        choiceId: feedback.choiceId,
        choiceLabel: feedback.choiceLabel,
        interruptId: feedback.interruptId,
        payload: feedback.payload,
      }),
    setDraft: lane.setDraft,
    showAuthorLabels: transcriptShowsSenderLabels({
      agentScope: props.agentScope,
      routeContext: props.thread?.route_context ?? null,
    }),
    slashCommands,
    starterPrompts: props.starterPromptsOverride ?? starterPrompts,
    status: composerStatus,
    // Reasoning/tool deltas don't change `messages` — feed raw stream activity
    // so the no-response guard never errors a live run.
    streamActivityCount: host.events.length,
    subAgentFullViewLabel: t("agentDesk.subAgent.fullView"),
    subAgentSectionLabels: {
      input: t("agentDesk.subAgent.input"),
      log: t("agentDesk.subAgent.log"),
      output: t("agentDesk.subAgent.output"),
    },
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
    transcriptFooter: spaceId ? (
      <AgentDeskRunActivity
        agentId={props.agentId}
        locale={locale}
        spaceId={spaceId}
        threadId={host.threadId}
      />
    ) : undefined,
    transcriptLoading,
  };

  // The companion's chrome, minus what it left unset: an explicit
  // `undefined` would otherwise shadow the lane's own value.
  const definedChrome = Object.fromEntries(
    Object.entries(props.companionChrome ?? {}).filter(
      ([, value]) => value !== undefined
    )
  ) as Partial<CopilotPanelContentProps>;
  const laneNode = (
    <div
      // No top clearance any more: the desk header is a real header now, so
      // the topbar no longer overlaps this lane.
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    >
      <CopilotPanelContent {...panelProps} {...definedChrome} />
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

function ReadOnlyThreadNotice({
  icon: Icon = Eye,
  label,
}: {
  icon?: typeof Eye;
  label: string;
}) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/40 px-4 py-3 text-muted-foreground text-sm">
      <Icon aria-hidden className="size-4 shrink-0" />
      <span>{label}</span>
    </div>
  );
}
