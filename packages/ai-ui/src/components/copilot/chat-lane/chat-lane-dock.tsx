"use client";

import type { AgUiOpenInterruptMetadata } from "@engenty/ag-ui-bridge";
import type { ReactNode } from "react";
import type { AgentHost } from "../../../agent-provider/types.js";
import type { CopilotMessageQueue } from "../../../copilot/use-copilot-message-queue.js";
import { CopilotMessageQueueSurface } from "../composer/copilot-message-queue-surface.js";
import { CopilotOpenInterruptBanner } from "../interrupts/copilot-open-interrupt-banner.js";

export interface ChatLaneDockLabels {
  drag: string;
  edit: string;
  remove: string;
  sendNow: string;
  title: string;
}

/**
 * The flap behind a lane's composer: queued messages on top, then the step a
 * graph run is parked on, then the decision / approval chooser of the
 * conversation run.
 *
 * All three live outside the scrolling transcript because they are things the
 * human still has to answer — scrolling away from a parked run is how a thread
 * looks wedged. Returns `null` when there is nothing pending; the panel treats
 * any non-null dock as a visible flap.
 */
export function ChatLaneDock({
  dockInterrupt,
  host,
  labels,
  onEditQueued,
  onSandboxCommandApprove,
  onSandboxCommandReject,
  queue,
  wizardStep,
}: {
  dockInterrupt: AgUiOpenInterruptMetadata | null;
  host: Pick<AgentHost, "dismissInterrupt" | "respond">;
  labels: ChatLaneDockLabels;
  onEditQueued: (id: string) => void;
  onSandboxCommandApprove: (open: AgUiOpenInterruptMetadata) => void;
  onSandboxCommandReject: (open: AgUiOpenInterruptMetadata) => void;
  queue: CopilotMessageQueue;
  /** The gate card of a parked graph run (`GateSurfaceCard`), if any. */
  wizardStep?: ReactNode;
}): ReactNode {
  const queueSurface = queue.hasQueued ? (
    <CopilotMessageQueueSurface
      labels={labels}
      onEdit={onEditQueued}
      onRemove={queue.remove}
      onReorder={queue.reorder}
      onSendNow={queue.sendNow}
      queued={queue.queued}
    />
  ) : null;
  const interruptBanner = dockInterrupt ? (
    <CopilotOpenInterruptBanner
      onDecisionChoose={(artifactId, choiceId, choiceLabel, interruptId) =>
        host.respond(dockInterrupt.tool_call_id, {
          artifactId,
          choiceId,
          choiceLabel,
          interruptId,
        })
      }
      onDismiss={host.dismissInterrupt}
      onFeedbackSubmit={(artifactId, feedback, interruptId) =>
        host.respond(dockInterrupt.tool_call_id, {
          artifactId,
          choiceId: "feedback_submit",
          choiceLabel: feedback,
          interruptId,
          payload: { feedback },
        })
      }
      onSandboxCommandApprove={onSandboxCommandApprove}
      onSandboxCommandReject={onSandboxCommandReject}
      open={dockInterrupt}
    />
  ) : null;
  if (!(queueSurface || wizardStep || interruptBanner)) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2">
      {queueSurface}
      {wizardStep}
      {interruptBanner}
    </div>
  );
}
