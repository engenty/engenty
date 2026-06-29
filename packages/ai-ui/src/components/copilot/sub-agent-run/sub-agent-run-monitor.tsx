"use client";

// Scrollable monitor for a single sub-agent delegation: input, output, and stream log.

import type { SubAgentDelegationDetail } from "../../../copilot/sub-agent-run/select-sub-agent-delegation.js";
import {
  formatSubAgentInputText,
  formatSubAgentOutputText,
} from "../../../copilot/sub-agent-run/sub-agent-run-display.js";
import { Shimmer } from "../../ai-elements/shimmer";
import {
  SubAgentLogPanel,
  type SubAgentRunSectionLabels,
  SubAgentTextPanel,
} from "./sub-agent-run-sections.js";

export interface SubAgentRunMonitorLabels extends SubAgentRunSectionLabels {
  running: string;
}

export function SubAgentRunMonitor(props: {
  delegation: SubAgentDelegationDetail;
  labels: SubAgentRunMonitorLabels;
}) {
  const { delegation, labels } = props;
  const isActive =
    delegation.state === "running" || delegation.state === "pending";
  const inputText = formatSubAgentInputText(delegation.input);
  const outputText = formatSubAgentOutputText(delegation.output);

  return (
    <div className="flex flex-col gap-3">
      {isActive ? (
        <p className="text-muted-foreground text-sm">
          <Shimmer as="span">{labels.running}</Shimmer>
        </p>
      ) : null}

      <SubAgentTextPanel
        collapsible
        emptyText="—"
        label={labels.input}
        text={inputText}
      />

      <SubAgentTextPanel
        emptyText="—"
        label={labels.output}
        markdown
        text={outputText}
      />

      <SubAgentLogPanel
        emptyText="—"
        isActive={isActive}
        label={labels.log}
        lines={delegation.progressLines}
        maxHeightClassName="max-h-[min(55vh,32rem)]"
      />
    </div>
  );
}
