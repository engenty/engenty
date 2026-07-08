"use client";

import type { AgUiOpenInterruptMetadata } from "@engenty/ag-ui-bridge";
import { isSandboxCommandOpenInterrupt } from "@engenty/ag-ui-bridge";
import {
  DecisionArtifactCard,
  decisionArtifactFromOpenInterrupt,
} from "./decision-artifact";
import {
  FeedbackArtifactCard,
  feedbackArtifactFromOpenInterrupt,
} from "./feedback-artifact";
import { SandboxCommandConfirmCard } from "./sandbox-command-confirm-card";

export function CopilotOpenInterruptBanner(props: {
  className?: string;
  onDecisionChoose: (
    artifactId: string,
    choiceId: string,
    choiceLabel: string,
    interruptId?: string
  ) => void;
  onFeedbackSubmit?: (
    artifactId: string,
    feedback: string,
    interruptId?: string
  ) => void;
  onSandboxCommandApprove?: (open: AgUiOpenInterruptMetadata) => void;
  onSandboxCommandReject?: (open: AgUiOpenInterruptMetadata) => void;
  open: AgUiOpenInterruptMetadata;
}) {
  if (isSandboxCommandOpenInterrupt(props.open)) {
    const { onSandboxCommandApprove, onSandboxCommandReject } = props;
    return (
      <div className={props.className}>
        <SandboxCommandConfirmCard
          onApprove={() => onSandboxCommandApprove?.(props.open)}
          onReject={() => onSandboxCommandReject?.(props.open)}
          open={props.open}
        />
      </div>
    );
  }

  const feedback = feedbackArtifactFromOpenInterrupt(props.open);
  if (feedback) {
    return (
      <div className={props.className}>
        <FeedbackArtifactCard
          artifact={feedback}
          onSubmit={(artifactId, value) => {
            props.onFeedbackSubmit?.(artifactId, value, feedback.interruptId);
          }}
        />
      </div>
    );
  }

  const decision = decisionArtifactFromOpenInterrupt(props.open);
  if (!decision) {
    return null;
  }

  return (
    <div className={props.className}>
      <DecisionArtifactCard
        artifact={decision}
        onChoose={(artifactId, choiceId, customLabel) => {
          const choice = decision.choices.find((c) => c.id === choiceId);
          const label = choice ? choice.label : customLabel || choiceId;
          props.onDecisionChoose(
            artifactId,
            choiceId,
            label,
            decision.interruptId
          );
        }}
      />
    </div>
  );
}
