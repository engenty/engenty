import type {
  AgentTurnMessageLike,
  AgUiOpenInterruptMetadata,
} from "@engenty/ag-ui-bridge";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { SubmitMessage } from "../../../agent-provider/types.js";
import type { TranscribeSpeechAudio } from "../../../lib/speech/use-speech-to-text.js";
import type { ChatKind } from "../chat-kind-badge.js";
import type { CopilotCompactContextOption } from "../composer/copilot-compact-context-option";
import type { StarterPromptItem } from "../composer/copilot-composer";
import type { CopilotDecisionInterruptFeedback } from "../interrupts/copilot-tool-call-actions";
import type { SubAgentRunSectionLabels } from "../sub-agent-run/sub-agent-run-sections.js";

export type CopilotEmptyLandingAlign = "center" | "start";

export interface CopilotPanelContentProps {
  agentDebugPayload?: unknown;

  attachLabel: string;
  /** When false, the status flap will not auto-expand after a run completes.
   *  Defaults to true. Set false when the reply is already visible in an
   *  attached thread/message container (e.g. the full copilot chat page). */
  autoExpand?: boolean;
  /** Change this when switching chats/sessions to snap the thread to the latest message. */
  autoScrollKey?: string | number | null;
  /** When true, decision widgets in the transcript stay interactive for the open interrupt only. */
  awaitingInterrupt?: boolean;
  /** When true, render only the body (no header). Used when header is wrapped by floating drag bar. */
  bodyOnly?: boolean;
  /** The person's browser beside the chat; shown while `browserPanelOpen`. */
  browserPanel?: ReactNode;
  browserPanelLabel?: string;
  browserPanelOpen?: boolean;

  /** When false, empty-state composer stays bottom-aligned (widget / embed chat). Default: centered dock landing. */
  centerEmptyLanding?: boolean;
  /** The badge in the header saying what kind of conversation this is. */
  chatKind?: ChatKind | null;
  /** Label for `onNewChat`. */
  clearLabel?: string;

  closeLabel: string;
  /** When true, show minimal UI (composer + compact transcript). Used for mini-floating. */
  compact?: boolean;
  /** Toolbar control next to attach menu when `composerDockStyle` (e.g. context dropdown). */
  compactContextControl?: ReactNode;
  /**
   * When true, composer matches bottom-dock chrome (compact plain input inside card).
   * Used for inline sidebar parity with floating dock.
   */
  composerDockStyle?: boolean;
  /** When this key changes (after mount), focus the composer (e.g. new chat reset). */
  composerFocusKey?: string | number | null;
  /**
   * Dock-style composer only: node rendered left of the attach (+) menu in the footer
   * (e.g. full-page chat agent picker).
   */
  composerLeadingControl?: ReactNode;
  /** Replaces the text composer while a realtime voice call owns the composer area. */
  composerOverride?: ReactNode;
  composerPlaceholder: string;
  /** Optional class for the composer wrapper (e.g. bordered container for bottom dock). */
  composerWrapperClassName?: string;
  /**
   * Padding around the transcript + composer column. `flush` drops horizontal and top padding
   * so full-page chat can fill the shell without double gutters (shell padding + body padding).
   */
  contentBodyGutter?: "default" | "flush";
  contextMenuLabel?: string;
  /** When set with onSelectContext, header shows context dropdown (sidebar / drawer / docked). */
  contextOptions?: CopilotCompactContextOption[];
  debugPayload?: unknown;
  detachLabel: string;
  /**
   * `tool_call_id` of the interrupt rendered in {@link dockedInterruptSurface}. Its inline
   * transcript copy is suppressed so the chooser appears only once (docked).
   */
  /** The interrupt card's ✕: close it without answering (inline transcript cards). */
  dismissInterrupt?: (open: AgUiOpenInterruptMetadata) => void;
  /**
   * Pending HITL surface (message queue, decision / feedback chooser) docked on the
   * composer, outside the scrolling transcript. Rendered as a card-background flap
   * attached directly behind the composer card (no gap).
   */
  dockedInterruptSurface?: ReactNode;
  dockedInterruptToolCallId?: string | null;
  draft: string;
  /**
   * Empty-chat layout. `start` pins identity + composer to the top of the
   * column (specialist desks). Default is centered for body-only dock landings.
   */
  emptyLandingAlign?: CopilotEmptyLandingAlign;
  /**
   * Replaces the default empty-title/subtitle block on dock landings (e.g. the
   * specialist identity header).
   */
  emptyStateHeader?: ReactNode;
  emptyStateSubtitle?: string;
  emptyStateTitle?: string;
  /** When true, the composer shows the animated status flap above the input. Set false to disable (e.g. full-page chat). */
  enableStatusFlap?: boolean;
  /** When set, the peeking composer uses this styleguide engenty. */
  engentyKind?: import("@engenty/ai-core/browser").AgentEngentyKind;
  error?: Error | null;
  /** Match app-shell `AppTopbar` chrome (`contentBlend` = compact transparent bar). */
  headerChrome?: CopilotHeaderChrome;
  /** Header variant: docked uses SidePanelHeader, floating uses draggable-style bar. */
  headerVariant?: "docked" | "floating";

  /** Optional @-mention targets for the composer (id + display + handle without `@`). */
  mentionAgentCandidates?: Array<{ handle: string; id: string; name: string }>;
  /** Async typed-mention search (users/contacts/objects/artifacts) for reference chips. */
  mentionRefSearch?: import("../composer/use-copilot-composer-mention.js").MentionRefSearch;
  messages: readonly (AgentTurnMessageLike & { id: string })[];
  /** When true, hide route status and "Review the prompt..." text. Used for bottom dock. */
  minimalChrome?: boolean;

  onClose: () => void;
  /** When user picks an agent from the @ mention list, sync shell agent selection (e.g. full-page chat). */
  onComposerMentionAgent?: (agentId: string) => void;
  /**
   * Header "new chat", for a host with threads of its own (a module hub
   * chat). Absent on the river and on a desk: one conversation has no "new".
   */
  onNewChat?: () => void;
  onPanelModeChange: (mode: "docked" | "floating") => void;
  /** A wizard `/command` is pressed by the host, never sent as a message. */
  onPressWizardCommand?: import("../composer/copilot-composer-section.js").CopilotComposerSectionProps["onPressWizardCommand"];
  /** Approve a pending sandbox command (resumes on the server). */
  onSandboxCommandApprove?: (open: AgUiOpenInterruptMetadata) => void;
  /** Reject a pending sandbox command. */
  onSandboxCommandReject?: (open: AgUiOpenInterruptMetadata) => void;
  onSelectContext?: (contextId: string) => void;
  /** Abort the in-flight AG-UI run from the composer stop control. */
  onStop?: () => void;
  /** Present = the header shows the monitor button. */
  onToggleBrowserPanel?: () => void;
  /** Open AG-UI interrupt metadata for the active session (decision / frontend tool). */
  openInterrupt?: AgUiOpenInterruptMetadata | null;
  /** Optimistic resolved labels keyed by toolCallId (set on `respond`). */
  optimisticInterruptResults?: Record<string, string>;
  panelMode: "docked" | "floating";
  /** Tool call ids the agent is suspended on (CopilotKit-shaped HITL status). */
  pendingInterruptToolCallIds?: ReadonlySet<string>;
  pendingUserInsertIndex?: number | null;
  /** Optimistic attachment / reference parts while a run is in flight. */
  pendingUserParts?: readonly unknown[] | null;
  /** Optimistic user text while a run is in flight (rendered outside `messages`). */
  pendingUserText?: string | null;
  /** Docked header: replaces detach/close with shell position menu (⋮). */
  positionMenu?: ReactNode;
  recentContextMenuLabel?: string;
  recentContextOptions?: CopilotCompactContextOption[];
  /** Resolve an interactive decision/feedback tool call: optimistic write + resume. */
  respond?: (
    toolCallId: string,
    feedback: CopilotDecisionInterruptFeedback
  ) => void;
  resumeInterrupt?: (feedback: CopilotDecisionInterruptFeedback) => void;

  /**
   * Optional status line when no context dropdown is shown (rare).
   * Prefer `contextOptions` + header dropdown for normal surfaces.
   */
  routeStatusLabel?: string;
  selectedCandidateValues?: Record<string, string | null>;
  selectedContextId?: string;

  setDraft: Dispatch<SetStateAction<string>>;
  setSelectedCandidateValues?: (
    v:
      | Record<string, string | null>
      | ((prev: Record<string, string | null>) => Record<string, string | null>)
  ) => void;

  /**
   * Sender names on user bubbles. Shared rooms pass true; personal /
   * Copilot chats leave this off so a 1:1 transcript does not label every turn.
   */
  showAuthorLabels?: boolean;
  /** Slash-command catalog for the composer ("/" at message start opens the menu). */
  slashCommands?: import("../composer/copilot-slash-command.js").ChatSlashCommand[];
  starterPrompts?: StarterPromptItem[];

  status: "ready" | "streaming" | "submitted" | "error";
  /** Count of received AG-UI stream events; any growth proves the stream is
   *  alive and restarts the no-response guard (reasoning/tool deltas don't
   *  change `messages`, so the guard cannot key on the transcript alone). */
  streamActivityCount?: number;
  /** Label for sub-agent full-page monitor link (module i18n). */
  subAgentFullViewLabel?: string;
  /** Input / output / log section titles on sub-agent cards + full-page monitor. */
  subAgentSectionLabels?: SubAgentRunSectionLabels;
  submitMessage: SubmitMessage;

  thinkingLabel: string;
  /** Active apps/ai thread id for composer usage meter. */
  threadId?: string | null;
  title?: string;
  transcribeAudio?: TranscribeSpeechAudio;
  /** Readable max-width wrapper for the transcript (full-page chat). */
  transcriptContainerClassName?: string;
  /**
   * Rendered at the END of the transcript column, in the message column's own
   * width — the position a "just happened" card belongs in. Not part of
   * `messages`: it carries what the lane knows but the thread does not, such as
   * work the agent started on its own (see `AgentDeskRunActivity`).
   */
  transcriptFooter?: ReactNode;
  /**
   * Rendered at the START of the transcript column, above the oldest loaded
   * message — the "load older" control of a paged transcript lives here.
   */
  transcriptHeader?: ReactNode;
  /** Session transcript fetch in progress (skeleton placeholder, not streaming shimmer). */
  transcriptLoading?: boolean;
  /** Accessible label for {@link transcriptLoading} (visually hidden). */
  transcriptLoadingLabel?: string;
  transcriptSurface?: "default" | "chat";

  voiceInputEnabled?: boolean;
  voiceInputLang?: string;
}

export type CopilotHeaderChrome = "contentBlend" | "default";
