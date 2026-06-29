"use client";

import { resolveTranscriptToolDisplay } from "../../../ag-ui/resolve-transcript-tool-display.js";
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
      {hasDetails ? <ToolCallDetailBody sections={sections} /> : null}
    </ToolCallCardBase>
  );
}
