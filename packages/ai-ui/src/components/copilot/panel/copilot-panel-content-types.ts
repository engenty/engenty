import type {
  AgentTurnMessageLike,
  AgUiOpenInterruptMetadata,
} from "@engenty/ag-ui-bridge";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { TranscribeSpeechAudio } from "../../../lib/speech/use-speech-to-text.js";
import type { CopilotCompactContextOption } from "../composer/copilot-compact-launcher";
import type { StarterPromptItem } from "../composer/copilot-composer";
import type { CopilotDecisionInterruptFeedback } from "../interrupts/copilot-tool-call-actions";
import type { FieldSuggestion } from "../interrupts/hitl-approval-card";
import type { SubAgentRunSectionLabels } from "../sub-agent-run/sub-agent-run-sections.js";

export interface CopilotPanelContentProps {
  agentDebugPayload?: unknown;
  /** When set, replaces the route context dropdown / title in the header. */
  agentSessionChooser?: ReactNode;
  appliedSuggestions?: FieldSuggestion[];
  applyError: string | null;
  applySelectedLabel: string;
  artifactError: string | null;
  artifactLoadFailedLabel: string;
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
  cancelLabel: string;
  /** When false, empty-state composer stays bottom-aligned (widget / embed chat). Default: centered dock landing. */
  centerEmptyLanding?: boolean;
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
   * Pending HITL surface (decision / feedback chooser) docked directly above the composer,
   * outside the scrolling transcript. Rendered as a `shrink-0` block with a top divider.
   */
  dockedInterruptSurface?: ReactNode;
  /**
   * `tool_call_id` of the interrupt rendered in {@link dockedInterruptSurface}. Its inline
   * transcript copy is suppressed so the chooser appears only once (docked).
   */
  dockedInterruptToolCallId?: string | null;
  draft: string;
  emptyStateSubtitle?: string;
  emptyStateTitle?: string;
  /** When true, the composer shows the animated status flap above the input. Set false to disable (e.g. full-page chat). */
  enableStatusFlap?: boolean;
  error?: Error | null;
  /** Match app-shell `AppTopbar` chrome (`contentBlend` = compact transparent bar). */
  headerChrome?: CopilotHeaderChrome;
  /** Header variant: docked uses SidePanelHeader, floating uses draggable-style bar. */
  headerVariant?: "docked" | "floating";
  isApplying: boolean;
  latestSuggestions: FieldSuggestion[];
  /** Optional @-mention targets for the composer (id + display + handle without `@`). */
  mentionAgentCandidates?: Array<{ handle: string; id: string; name: string }>;
  messages: readonly (AgentTurnMessageLike & { id: string })[];
  /** When true, hide route status and "Review the prompt..." text. Used for bottom dock. */
  minimalChrome?: boolean;
  onApplySuggestions: () => void;
  onCancel: () => void;
  onClose: () => void;
  /** When user picks an agent from the @ mention list, sync shell agent selection (e.g. full-page chat). */
  onComposerMentionAgent?: (agentId: string) => void;
  /** Header "new chat" action; may be wired to new-session-for-agent when using {@link agentSessionChooser}. */
  onNewChat: () => void;
  onPanelModeChange: (mode: "docked" | "floating") => void;
  /** Approve a pending sandbox command (resumes on the server). */
  onSandboxCommandApprove?: (open: AgUiOpenInterruptMetadata) => void;
  /** Reject a pending sandbox command. */
  onSandboxCommandReject?: (open: AgUiOpenInterruptMetadata) => void;
  onSelectContext?: (contextId: string) => void;
  /** Abort the in-flight AG-UI run from the composer stop control. */
  onStop?: () => void;
  /** Open AG-UI interrupt metadata for the active session (decision / frontend tool). */
  openInterrupt?: AgUiOpenInterruptMetadata | null;
  /** Optimistic resolved labels keyed by toolCallId (set on `respond`). */
  optimisticInterruptResults?: Record<string, string>;
  panelMode: "docked" | "floating";
  /** Tool call ids the agent is suspended on (CopilotKit-shaped HITL status). */
  pendingInterruptToolCallIds?: ReadonlySet<string>;
  pendingUserInsertIndex?: number | null;
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
  reviewPromptLabel: string;
  /**
   * Optional status line when no context dropdown is shown (rare).
   * Prefer `contextOptions` + header dropdown for normal surfaces.
   */
  routeStatusLabel?: string;
  selectedCandidateValues?: Record<string, string | null>;
  selectedContextId?: string;
  selectedCountLabel: string;
  selectedSuggestions: Record<string, boolean>;
  setDraft: Dispatch<SetStateAction<string>>;
  setSelectedCandidateValues?: (
    v:
      | Record<string, string | null>
      | ((prev: Record<string, string | null>) => Record<string, string | null>)
  ) => void;
  setSelectedSuggestions: (
    v:
      | Record<string, boolean>
      | ((prev: Record<string, boolean>) => Record<string, boolean>)
  ) => void;
  starterPrompts?: StarterPromptItem[];
  startMode: "manual" | "auto";
  status: "ready" | "streaming" | "submitted" | "error";
  /** Label for sub-agent full-page monitor link (module i18n). */
  subAgentFullViewLabel?: string;
  /** Input / output / log section titles on sub-agent cards + full-page monitor. */
  subAgentSectionLabels?: SubAgentRunSectionLabels;
  submitMessage: (
    text: string,
    options?: { requestedAgentId?: string }
  ) => void;
  suggestedUpdatesLabel: string;
  thinkingLabel: string;
  /** Active apps/ai thread id for composer usage meter. */
  threadId?: string | null;
  title?: string;
  transcribeAudio?: TranscribeSpeechAudio;
  /** Readable max-width wrapper for the transcript (full-page chat). */
  transcriptContainerClassName?: string;
  /** Session transcript fetch in progress (skeleton placeholder, not streaming shimmer). */
  transcriptLoading?: boolean;
  /** Accessible label for {@link transcriptLoading} (visually hidden). */
  transcriptLoadingLabel?: string;
  transcriptSurface?: "default" | "chat";
  triggerType: "message_copilot" | "button" | "shortcut";
  voiceInputEnabled?: boolean;
  voiceInputLang?: string;
}

export type CopilotHeaderChrome = "contentBlend" | "default";
