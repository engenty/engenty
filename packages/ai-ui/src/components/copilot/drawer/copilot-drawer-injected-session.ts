import type { AgUiOpenInterruptMetadata } from "@engenty/ag-ui-bridge";
import type { Dispatch, SetStateAction } from "react";
import type { SubmitMessage } from "../../../agent-provider/types.js";
import type { FieldSuggestion } from "../interrupts/hitl-approval-card";
import type { CopilotPanelContentProps } from "../panel/copilot-panel-content";
import type { CopilotRouteContext } from "../session/copilot-route-context.js";

/** Session API supplied by host (`useAgentHost` + `useCopilotThreadActions`); drawer does not own thread persistence. */
export interface CopilotDrawerInjectedSession {
  activeThreadId: string | null;
  appendWithHeaders: (text: string) => Promise<void>;
  applyError: string | null;
  artifactError: string | null;
  awaitingInterrupt?: boolean;
  cancelRun: () => void;
  clearDrawerComposerState: () => void;
  contextPayload: CopilotRouteContext;
  draft: string;
  error: Error | null;
  handleNewChat: () => void;
  isApplying: boolean;
  latestSuggestions: FieldSuggestion[];
  lifecycle: string;
  messages: CopilotPanelContentProps["messages"];
  openInterruptFromSession?: AgUiOpenInterruptMetadata | null;
  /** Freshly-opened interrupt from the live stream — wins over the (lagging) session-metadata copy. */
  openInterruptFromStream?: AgUiOpenInterruptMetadata | null;
  /** Optimistic resolved labels keyed by toolCallId (set on `respond`). */
  optimisticInterruptResults?: Record<string, string>;
  pauseRun: () => void;
  /** Tool call ids the agent is suspended on (CopilotKit-shaped HITL status, from the stream). */
  pendingInterruptToolCallIds?: ReadonlySet<string>;
  pendingUserInsertIndex?: number | null;
  pendingUserText?: string | null;
  /** Resolve an interactive decision/feedback tool call: optimistic write + resume. */
  respond?: (
    toolCallId: string,
    feedback: {
      artifactId: string;
      choiceId: string;
      choiceLabel: string;
      interruptId?: string;
      payload?: Record<string, unknown>;
    }
  ) => void;
  resumeInterrupt?: (
    feedback:
      | {
          artifactId: string;
          choiceId: string;
          choiceLabel: string;
          interruptId?: string;
          payload?: Record<string, unknown>;
        }
      | {
          approved: boolean;
          interruptId: string;
          output?: unknown;
          toolName: string;
        }
  ) => void;
  resumeRun: () => void;
  selectedCandidateValues: Record<string, string | null>;
  selectedSuggestions: Record<string, boolean>;
  setActiveThreadId: (threadId: string | null) => void;
  setApplyError: (message: string | null) => void;
  setDraft: Dispatch<SetStateAction<string>>;
  setIsApplying: (value: boolean) => void;
  setSelectedCandidateValues: Dispatch<
    SetStateAction<Record<string, string | null>>
  >;
  setSelectedSuggestions: Dispatch<SetStateAction<Record<string, boolean>>>;
  status: CopilotPanelContentProps["status"];
  submitMessage: SubmitMessage;
  threadResetKey?: number;
}
