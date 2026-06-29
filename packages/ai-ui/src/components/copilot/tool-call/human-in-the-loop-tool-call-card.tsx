"use client";

import { useState } from "react";
import {
  getHumanInTheLoopRender,
  type HumanInTheLoopStatus,
  resolveHumanAnswer,
} from "../../../copilot/human-in-the-loop-registry.js";
import { useCopilotToolCallActions } from "../interrupts/copilot-tool-call-actions";
import {
  isActiveFrontendToolConfirmation,
  isAwaitingFrontendToolConfirmationOutput,
  resolveOpenInterruptForToolCall,
} from "./frontend-tool-confirm-tool-call-card";
import type { ToolCallCardProps } from "./tool-call-card.types";

/** A suspended frontend-tool call that has a module-registered HITL render. */
export function matchesHumanInTheLoopToolCall(output: unknown): boolean {
  return (
    isAwaitingFrontendToolConfirmationOutput(output) &&
    getHumanInTheLoopRender(output.tool_name) !== undefined
  );
}

export function HumanInTheLoopToolCallCard(props: ToolCallCardProps) {
  const { awaitingInterrupt, onFrontendToolApprove, openInterrupt } =
    useCopilotToolCallActions();
  const [responded, setResponded] = useState(false);

  const pending = isAwaitingFrontendToolConfirmationOutput(props.output)
    ? props.output
    : null;
  const entry = pending
    ? getHumanInTheLoopRender(pending.tool_name)
    : undefined;
  if (!(pending && entry)) {
    return null;
  }

  const open = resolveOpenInterruptForToolCall(
    openInterrupt,
    pending,
    props.toolCallId
  );
  const isPending = isActiveFrontendToolConfirmation({
    awaitingInterrupt,
    callId: pending.call_id,
    openInterrupt: open,
  });

  // Validate args; fall back to raw input rather than dropping the card.
  const parsed = entry.schema.safeParse(pending.input);
  const input = parsed.success ? parsed.data : pending.input;

  const status: HumanInTheLoopStatus = responded
    ? "submitted"
    : isPending
      ? "executing"
      : "complete";

  // Resume the run with the user's answer: resolve the handler's awaited promise,
  // then trigger the existing frontend-tool approve path (executes the handler →
  // resumes with the answer as the tool output).
  const respond = (answer: unknown) => {
    if (responded) {
      return;
    }
    setResponded(true);
    resolveHumanAnswer(open.tool_call_id || pending.call_id, answer);
    onFrontendToolApprove?.(open);
  };

  return <>{entry.render({ input, respond, status })}</>;
}
