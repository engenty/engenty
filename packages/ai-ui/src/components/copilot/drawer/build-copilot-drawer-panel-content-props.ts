import type { AgUiOpenInterruptMetadata } from "@engenty/ag-ui-bridge";
import type { ReactNode } from "react";
import type { CopilotCompactContextOption } from "../composer/copilot-compact-context-option";
import type { StarterPromptItem } from "../composer/copilot-composer";
import type { ChatSlashCommand } from "../composer/copilot-slash-command";
import type { FieldSuggestion } from "../interrupts/hitl-approval-card";
import type {
  CopilotHeaderChrome,
  CopilotPanelContentProps,
} from "../panel/copilot-panel-content";
import type { CopilotDrawerInjectedLane } from "./copilot-drawer-injected-lane.js";
import { formatCopilotRouteStatusLabel } from "./copilot-drawer-utils";

export interface BuildCopilotDrawerPanelContentPropsInput {
  activeCopilotContext?: { moduleId?: string; routeKey?: string };
  agentDebugPayload?: unknown;
  appliedSuggestions: FieldSuggestion[];
  applySelectedLabel: string;
  attachLabel: string;
  awaitingInterrupt?: boolean;
  cancelLabel: string;
  clearLabel?: string;
  closeLabel: string;
  compactContextOptions: CopilotCompactContextOption[];
  composerFocusKey: string;
  composerPlaceholder: string;
  detachLabel: string;
  handleApplySuggestions: () => void | Promise<void>;
  handleCancel: () => void;
  handleCompactContextChange: (contextId: string) => void;
  handleHeaderClose: () => void;
  handleHeaderNewChat: () => void;
  handleSurfacePanelModeChange: (mode: "docked" | "floating") => void;
  headerChrome: CopilotHeaderChrome;
  injected: CopilotDrawerInjectedLane;
  module: string;
  onClose: () => void;
  openInterrupt: AgUiOpenInterruptMetadata | null;
  panelMode: "docked" | "floating";
  positionMenu: ReactNode;
  recentCompactContexts: CopilotCompactContextOption[];
  resumeInterrupt?: CopilotDrawerInjectedLane["resumeInterrupt"];
  reviewPromptLabel: string;
  routeKey: string;
  selectedCompactContextId: string;
  selectedCountLabel: string;
  shouldHideSuggestionsReview: boolean;
  slashCommands?: ChatSlashCommand[];
  starterPrompts?: StarterPromptItem[];
  startMode: "manual" | "auto";
  suggestedUpdatesLabel: string;
  thinkingLabel: string;
  threadChooserEnabled: boolean;
  threadChooserRender: (variant: "compact" | "panel") => ReactNode;
  title: string;
  triggerType: "message_copilot" | "button" | "shortcut";
}

export function buildCopilotDrawerPanelContentProps(
  input: BuildCopilotDrawerPanelContentPropsInput
): CopilotPanelContentProps {
  return {
    ...(input.threadChooserEnabled
      ? { threadChooser: input.threadChooserRender("panel") }
      : {
          contextOptions: input.compactContextOptions,
          contextMenuLabel: "Context",
          onSelectContext: input.handleCompactContextChange,
          recentContextMenuLabel: "Recent",
          recentContextOptions: input.recentCompactContexts,
          selectedContextId: input.selectedCompactContextId,
        }),
    routeStatusLabel:
      input.compactContextOptions.length > 0
        ? undefined
        : formatCopilotRouteStatusLabel(
            input.activeCopilotContext?.moduleId ?? input.module,
            input.activeCopilotContext?.routeKey ?? input.routeKey
          ),
    title: input.title,
    error: input.injected.error ?? null,
    messages: input.injected.messages,
    pendingUserInsertIndex: input.injected.pendingUserInsertIndex,
    pendingUserParts: input.injected.pendingUserParts,
    pendingUserText: input.injected.pendingUserText,
    status:
      input.injected.awaitingInterrupt && input.injected.status === "ready"
        ? "submitted"
        : input.injected.status,
    threadId: input.injected.activeThreadId,
    startMode: input.startMode,
    draft: input.injected.draft,
    setDraft: input.injected.setDraft,
    submitMessage: input.injected.submitMessage,
    composerPlaceholder: input.composerPlaceholder,
    slashCommands: input.slashCommands,
    starterPrompts: input.starterPrompts,
    reviewPromptLabel: input.reviewPromptLabel,
    thinkingLabel: input.thinkingLabel,
    debugPayload: undefined,
    agentDebugPayload: input.agentDebugPayload,
    resumeInterrupt: input.injected.resumeInterrupt,
    awaitingInterrupt: input.injected.awaitingInterrupt,
    openInterrupt: input.openInterrupt,
    latestSuggestions: input.shouldHideSuggestionsReview
      ? []
      : input.injected.latestSuggestions,
    selectedSuggestions: input.injected.selectedSuggestions,
    setSelectedSuggestions: input.injected.setSelectedSuggestions,
    selectedCandidateValues: input.injected.selectedCandidateValues,
    setSelectedCandidateValues: input.injected.setSelectedCandidateValues,
    isApplying: input.injected.isApplying,
    applyError: input.injected.applyError,
    appliedSuggestions: input.appliedSuggestions,
    artifactError: null,
    artifactLoadFailedLabel: "Failed to load suggestions artifact",
    applySelectedLabel: input.applySelectedLabel,
    cancelLabel: input.cancelLabel,
    selectedCountLabel: input.selectedCountLabel,
    suggestedUpdatesLabel: input.suggestedUpdatesLabel,
    clearLabel: input.clearLabel,
    triggerType: input.triggerType,
    panelMode: input.panelMode,
    composerFocusKey: input.composerFocusKey,
    headerChrome: input.headerChrome,
    onNewChat: input.handleHeaderNewChat,
    onApplySuggestions: input.handleApplySuggestions,
    onCancel: input.handleCancel,
    onPanelModeChange: input.handleSurfacePanelModeChange,
    onClose: input.handleHeaderClose,
    attachLabel: input.attachLabel,
    detachLabel: input.detachLabel,
    closeLabel: input.closeLabel,
    positionMenu: input.positionMenu,
  };
}
