"use client";

import {
  type AgUiOpenInterruptMetadata,
  buildFrontendToolOpenInterrupt,
  isFrontendToolOpenInterrupt,
} from "@engenty/ag-ui-bridge";
import { useCopilotToolCallActions } from "../interrupts/copilot-tool-call-actions";
import { FrontendToolConfirmCard } from "../interrupts/frontend-tool-confirm-card";
import {
  type AwaitingFrontendToolConfirmationOutput,
  isAwaitingFrontendToolConfirmationOutput,
} from "./frontend-tool-confirmation-output";
import type { ToolCallCardProps } from "./tool-call-card.types";
import { ToolCallCardBase } from "./tool-call-card-base";

export type { AwaitingFrontendToolConfirmationOutput } from "./frontend-tool-confirmation-output";
export {
  isAwaitingFrontendToolConfirmationOutput,
  matchesFrontendToolConfirmationOutput,
} from "./frontend-tool-confirmation-output";

export function resolveOpenInterruptForToolCall(
  openInterrupt: AgUiOpenInterruptMetadata | null | undefined,
  pending: AwaitingFrontendToolConfirmationOutput,
  toolCallId?: string
): AgUiOpenInterruptMetadata {
  const callId = pending.call_id || toolCallId || "";
  if (
    openInterrupt &&
    isFrontendToolOpenInterrupt(openInterrupt) &&
    openInterrupt.tool_call_id === callId
  ) {
    return openInterrupt;
  }
  return buildFrontendToolOpenInterrupt({
    artifact_id: callId,
    interrupt_id: callId,
    title: pending.tool_name,
    tool_call_id: callId,
    tool_name: pending.tool_name,
    tool_input:
      pending.input === undefined
        ? undefined
        : (JSON.parse(JSON.stringify(pending.input)) as never),
  });
}

export function isActiveFrontendToolConfirmation(input: {
  awaitingInterrupt?: boolean;
  callId: string;
  openInterrupt?: AgUiOpenInterruptMetadata | null;
}): boolean {
  if (!(input.awaitingInterrupt && input.openInterrupt)) {
    return false;
  }
  if (!isFrontendToolOpenInterrupt(input.openInterrupt)) {
    return false;
  }
  return input.openInterrupt.tool_call_id === input.callId;
}

export function FrontendToolConfirmToolCallCard(props: ToolCallCardProps) {
  const {
    awaitingInterrupt,
    onFrontendToolApprove,
    onFrontendToolReject,
    openInterrupt,
  } = useCopilotToolCallActions();

  const pending = isAwaitingFrontendToolConfirmationOutput(props.output)
    ? props.output
    : null;
  if (!pending) {
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

  if (!isPending) {
    return (
      <ToolCallCardBase
        {...props}
        defaultOpen={false}
        details={[]}
        headline={props.displayLabel ?? pending.tool_name}
        state="completed"
      >
        <p className="mt-1 text-muted-foreground text-sm">
          Confirmation handled
        </p>
      </ToolCallCardBase>
    );
  }

  return (
    <FrontendToolConfirmCard
      onApprove={() => onFrontendToolApprove?.(open)}
      onReject={() => onFrontendToolReject?.(open)}
      open={open}
    />
  );
}
