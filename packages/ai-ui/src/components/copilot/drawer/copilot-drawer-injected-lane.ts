import type { AgUiOpenInterruptMetadata } from "@engenty/ag-ui-bridge";
import type { Dispatch, SetStateAction } from "react";
import type { SubmitMessage } from "../../../agent-provider/types.js";
import type { FieldSuggestion } from "../interrupts/hitl-approval-card";
import type { CopilotPanelContentProps } from "../panel/copilot-panel-content";
import type { CopilotRouteContext } from "../session/copilot-route-context.js";

/** Host-injected AG-UI lane API for `CopilotDrawer` (`@engenty/ai-ui`; ui-core does not import ai-ui). */
export interface CopilotDrawerInjectedLane {
  activeThreadId: string | null;
  appendWithHeaders: (text: string) => Promise<void>;
  applyError: string | null;
  awaitingInterrupt?: boolean;
  cancelRun: () => void;
  /** Clears drawer-local UI only (draft, suggestions) — not the EngentyAgent lane. */
  clearDrawerLocalState: () => void;
  contextPayload: CopilotRouteContext;
  draft: string;
  error: Error | null;
  handleNewChat: () => void;
  isApplying: boolean;
  latestSuggestions: FieldSuggestion[];
  lifecycle: string;
  messages: CopilotPanelContentProps["messages"];
  openInterrupt?: AgUiOpenInterruptMetadata | null;
  pauseRun: () => void;
  pendingUserInsertIndex?: number | null;
  pendingUserText?: string | null;
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
  setApplyError: (message: string | null) => void;
  setDraft: Dispatch<SetStateAction<string>>;
  setIsApplying: (value: boolean) => void;
  setSelectedCandidateValues: Dispatch<
    SetStateAction<Record<string, string | null>>
  >;
  setSelectedSuggestions: Dispatch<SetStateAction<Record<string, boolean>>>;
  status: CopilotPanelContentProps["status"];
  submitMessage: SubmitMessage;
  threadId: string | null;
  threadResetKey?: number;
}
