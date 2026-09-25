"use client";

import { resolveTranscriptToolDisplay } from "../../../ag-ui/resolve-transcript-tool-display.js";
import { FullToolOutput } from "./full-tool-output";
import type { ToolCallCardProps } from "./tool-call-card.types";
import { ToolCallCardBase } from "./tool-call-card-base";
import { ToolCallDetailBody } from "./tool-call-detail-body";
import { buildToolCallDetailSections } from "./tool-call-presentation";

function resolveHeadline(props: ToolCallCardProps): {
  headline: string;
  metadata?: string;
} {
  const normalized = resolveTranscriptToolDisplay({
    toolName: props.toolName,
    input: props.input,
    output: props.output,
  });
  return {
    headline: props.displayLabel ?? normalized.displayLabel,
    metadata: props.metadata ?? normalized.metadata,
  };
}

/**
 * The expanded body. It mounts only when the card is opened, so a slim
 * transcript's placeholder result is swapped for the full one here.
 */
function ToolCallGenericDetails(props: ToolCallCardProps) {
  return (
    <FullToolOutput output={props.output} toolCallId={props.toolCallId}>
      {(output) => (
        <ToolCallDetailBody
          sections={buildToolCallDetailSections({
            toolName: props.toolName,
            input: props.input,
            output,
            errorText: props.errorText,
            state: props.state,
          })}
        />
      )}
    </FullToolOutput>
  );
}

export function ToolCallGenericCard(props: ToolCallCardProps) {
  const { toolName, ...baseProps } = props;
  const { headline, metadata } = resolveHeadline(props);
  const sections = buildToolCallDetailSections({
    toolName,
    input: props.input,
    output: props.output,
    errorText: props.errorText,
    state: props.state,
  });
  const hasDetails =
    sections.fields.length > 0 ||
    Boolean(sections.outputText) ||
    Boolean(sections.errorMessage);
  const rowHeadline =
    props.state === "error" && !headline.toLowerCase().startsWith("failed")
      ? `Failed · ${headline}`
      : headline;

  return (
    <ToolCallCardBase
      {...baseProps}
      details={[]}
      headline={rowHeadline}
      metadata={metadata}
    >
      {hasDetails ? <ToolCallGenericDetails {...props} /> : null}
    </ToolCallCardBase>
  );
}
