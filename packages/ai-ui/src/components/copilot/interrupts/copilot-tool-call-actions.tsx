"use client";

import type { AgUiOpenInterruptMetadata } from "@engenty/ag-ui-bridge";
import { createContext, type ReactNode, useContext, useMemo } from "react";

export interface CopilotDecisionInterruptFeedback {
  artifactId: string;
  choiceId: string;
  choiceLabel: string;
  interruptId?: string;
  payload?: Record<string, unknown>;
}

export interface CopilotToolCallActionsValue {
  awaitingInterrupt?: boolean;
  onFrontendToolApprove?: (open: AgUiOpenInterruptMetadata) => void;
  onFrontendToolReject?: (open: AgUiOpenInterruptMetadata) => void;
  openInterrupt?: AgUiOpenInterruptMetadata | null;
  /** Optimistic resolved labels keyed by toolCallId, set on `respond` so the chooser collapses instantly. */
  optimisticInterruptResults?: Record<string, string>;
  /** Tool call ids the agent is suspended on (CopilotKit-shaped HITL status, from the stream). */
  pendingInterruptToolCallIds?: ReadonlySet<string>;
  /** Resolve an interactive decision/feedback tool call: optimistic write + resume. */
  respond?: (
    toolCallId: string,
    feedback: CopilotDecisionInterruptFeedback
  ) => void;
  submitMessage?: (text: string) => void;
}

const CopilotToolCallActionsContext =
  createContext<CopilotToolCallActionsValue | null>(null);

const EMPTY_PENDING: ReadonlySet<string> = new Set();
const EMPTY_RESULTS: Record<string, string> = {};

export function CopilotToolCallActionsProvider({
  awaitingInterrupt = false,
  children,
  onFrontendToolApprove,
  onFrontendToolReject,
  openInterrupt,
  pendingInterruptToolCallIds,
  optimisticInterruptResults,
  respond,
  submitMessage,
}: {
  awaitingInterrupt?: boolean;
  children: ReactNode;
  onFrontendToolApprove?: (open: AgUiOpenInterruptMetadata) => void;
  onFrontendToolReject?: (open: AgUiOpenInterruptMetadata) => void;
  openInterrupt?: AgUiOpenInterruptMetadata | null;
  pendingInterruptToolCallIds?: ReadonlySet<string>;
  optimisticInterruptResults?: Record<string, string>;
  respond?: (
    toolCallId: string,
    feedback: CopilotDecisionInterruptFeedback
  ) => void;
  submitMessage?: (text: string) => void;
}) {
  const value = useMemo(
    () => ({
      awaitingInterrupt,
      onFrontendToolApprove,
      onFrontendToolReject,
      openInterrupt: openInterrupt ?? null,
      pendingInterruptToolCallIds: pendingInterruptToolCallIds ?? EMPTY_PENDING,
      optimisticInterruptResults: optimisticInterruptResults ?? EMPTY_RESULTS,
      respond,
      submitMessage,
    }),
    [
      awaitingInterrupt,
      onFrontendToolApprove,
      onFrontendToolReject,
      openInterrupt,
      pendingInterruptToolCallIds,
      optimisticInterruptResults,
      respond,
      submitMessage,
    ]
  );

  return (
    <CopilotToolCallActionsContext.Provider value={value}>
      {children}
    </CopilotToolCallActionsContext.Provider>
  );
}

export function useCopilotToolCallActions(): CopilotToolCallActionsValue {
  return useContext(CopilotToolCallActionsContext) ?? {};
}
