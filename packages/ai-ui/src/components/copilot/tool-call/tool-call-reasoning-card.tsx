"use client";

import type { ToolCallCardProps } from "./tool-call-card.types";
import { ToolCallCardBase } from "./tool-call-card-base";
import { findFirstStringDeep } from "./tool-call-card-utils";

export function ToolCallReasoningCard(props: ToolCallCardProps) {
  const { toolName: _toolName, ...baseProps } = props;
  const outputText =
    typeof props.output === "string" ? props.output.trim() : "";
  const nestedSummary =
    findFirstStringDeep(props.output, [
      "summary",
      "reasoning",
      "thought",
      "text",
    ]) ??
    findFirstStringDeep(props.input, [
      "summary",
      "reasoning",
      "thought",
      "text",
    ]);
  const summary = outputText || nestedSummary;

  const details = summary
    ? [summary]
    : [
        props.state === "running"
          ? "Thinking in progress..."
          : "No reasoning text",
      ];

  return (
    <ToolCallCardBase
      {...baseProps}
      details={details}
      headline={
        props.displayLabel ??
        (props.state === "running" ? "Thinking" : "Reasoning")
      }
      tone="reasoning"
    />
  );
}
