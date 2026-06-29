"use client";

import {
  FIELD_SUGGESTIONS_ARTIFACT_TYPE,
  type ProposeUpdatesArtifact,
} from "@engenty/ai-core/browser";
import { useState } from "react";
import { useCopilotToolCallActions } from "../interrupts/copilot-tool-call-actions";
import type { FieldSuggestion } from "../interrupts/hitl-approval-card";
import { HitlApprovalCard } from "../interrupts/hitl-approval-card";
import { getInteractiveToolStatus } from "../interrupts/interactive-tool-status";
import type { ToolCallCardProps } from "./tool-call-card.types";

function parseProposeUpdatesArtifact(
  output: unknown
): ProposeUpdatesArtifact | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return null;
  }
  const raw = output as Record<string, unknown>;
  if (
    raw.ok !== true ||
    raw.artifact_emitted !== true ||
    raw.artifact_type !== FIELD_SUGGESTIONS_ARTIFACT_TYPE ||
    typeof raw.artifact_id !== "string" ||
    !raw.artifact_id.trim() ||
    !Array.isArray(raw.suggestions)
  ) {
    return null;
  }
  return output as ProposeUpdatesArtifact;
}

export function matchesProposeUpdatesOutput(output: unknown): boolean {
  return parseProposeUpdatesArtifact(output) !== null;
}

function ProposeUpdatesResolvedCard({
  resolvedLabel,
  title,
}: {
  resolvedLabel: string | null;
  title?: string;
}) {
  return (
    <section className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
      <p className="font-medium text-foreground/90 text-sm">
        {title ?? "Suggested updates"}
      </p>
      <p className="mt-1 text-muted-foreground text-sm">
        {resolvedLabel ?? "Submitted"}
      </p>
    </section>
  );
}

export function ProposeUpdatesToolCallCard(props: ToolCallCardProps) {
  const { optimisticInterruptResults, pendingInterruptToolCallIds, respond } =
    useCopilotToolCallActions();

  const artifact = parseProposeUpdatesArtifact(props.output);
  const [selectedSuggestions, setSelectedSuggestions] = useState<
    Record<string, boolean>
  >({});
  const [selectedCandidateValues, setSelectedCandidateValues] = useState<
    Record<string, string | null>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!artifact) {
    return null;
  }

  const { status, resolvedLabel } = getInteractiveToolStatus({
    toolCallId: props.toolCallId,
    toolName: props.toolName,
    output: props.output,
    pendingInterruptToolCallIds: pendingInterruptToolCallIds ?? new Set(),
    optimisticInterruptResults: optimisticInterruptResults ?? {},
  });

  if (status === "complete") {
    return (
      <ProposeUpdatesResolvedCard
        resolvedLabel={resolvedLabel}
        title={artifact.title}
      />
    );
  }

  const handleApply = () => {
    if (!(respond && props.toolCallId) || isSubmitting) {
      return;
    }
    const appliedFields = Object.entries(selectedSuggestions)
      .filter(([, checked]) => checked)
      .map(([field]) => field);

    if (appliedFields.length === 0) {
      return;
    }

    const appliedValues: Record<string, string | null> = {};
    for (const field of appliedFields) {
      const suggestion = artifact.suggestions.find(
        (s: FieldSuggestion) => s.field === field
      );
      if (!suggestion) {
        continue;
      }
      const candidateOverride = selectedCandidateValues[field];
      appliedValues[field] =
        candidateOverride === undefined ? suggestion.value : candidateOverride;
    }

    const countLabel =
      appliedFields.length === 1
        ? "Applied 1 field"
        : `Applied ${appliedFields.length} fields`;

    setIsSubmitting(true);
    respond(props.toolCallId, {
      artifactId: artifact.artifact_id,
      choiceId: "apply",
      choiceLabel: countLabel,
      interruptId: artifact.interrupt_id,
      payload: {
        approved: true,
        applied_fields: appliedFields,
        applied_values: appliedValues,
      },
    });
  };

  const handleReject = () => {
    if (!(respond && props.toolCallId) || isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    respond(props.toolCallId, {
      artifactId: artifact.artifact_id,
      choiceId: "reject",
      choiceLabel: "Rejected",
      interruptId: artifact.interrupt_id,
      payload: { approved: false },
    });
  };

  return (
    <HitlApprovalCard
      disabled={isSubmitting}
      onApply={handleApply}
      onReject={handleReject}
      onSelectedCandidateChange={(field, value) =>
        setSelectedCandidateValues((prev) => ({ ...prev, [field]: value }))
      }
      onSelectedChange={(field, checked) =>
        setSelectedSuggestions((prev) => ({ ...prev, [field]: checked }))
      }
      selected={selectedSuggestions}
      selectedCandidateValues={selectedCandidateValues}
      suggestions={artifact.suggestions as FieldSuggestion[]}
      titleLabel={artifact.title ?? "Suggested updates"}
    />
  );
}
