"use client";

// Full-page sub-agent monitor for `?subRun=<toolCallId>` on the copilot chat route.
// Reuses the same host transcript (no second thread); back navigation only drops
// the query param so the main chat panel is unchanged underneath.

import { Button } from "@engenty/ui-core";
import { ArrowLeft } from "lucide-react";
import { selectSubAgentDelegationFromMessages } from "../../../copilot/sub-agent-run/select-sub-agent-delegation.js";
import type { CopilotPanelContentProps } from "../../presentation.js";
import {
  SubAgentRunMonitor,
  type SubAgentRunMonitorLabels,
} from "./sub-agent-run-monitor.js";

export interface SubAgentRunFullPageLabels extends SubAgentRunMonitorLabels {
  backToChat: string;
  notFound: string;
}

export interface SubAgentRunFullPageProps {
  labels: SubAgentRunFullPageLabels;
  messages: CopilotPanelContentProps["messages"];
  onBack: () => void;
  toolCallId: string;
}

export function SubAgentRunFullPage({
  labels,
  messages,
  onBack,
  toolCallId,
}: SubAgentRunFullPageProps) {
  const delegation = selectSubAgentDelegationFromMessages(messages, toolCallId);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-page">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <Button
          className="w-fit"
          onClick={onBack}
          size="sm"
          type="button"
          variant="ghost"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {labels.backToChat}
        </Button>
        {delegation ? (
          <SubAgentRunMonitor delegation={delegation} labels={labels} />
        ) : (
          <p className="text-muted-foreground text-sm">{labels.notFound}</p>
        )}
      </div>
    </div>
  );
}

export type { SubAgentDelegationDetail } from "../../../copilot/sub-agent-run/select-sub-agent-delegation.js";
