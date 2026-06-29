"use client";

import type { AgUiOpenInterruptMetadata } from "@engenty/ag-ui-bridge";
import { CopilotOpenInterruptBanner } from "../copilot-open-interrupt-banner";
import type { CopilotDrawerInjectedLane } from "./copilot-drawer-injected-lane.js";

export interface CopilotDrawerInterruptBannerProps {
  injected: CopilotDrawerInjectedLane;
  onFrontendToolInterruptApprove?: (
    open: AgUiOpenInterruptMetadata
  ) => void | Promise<void>;
  onFrontendToolInterruptReject?: (open: AgUiOpenInterruptMetadata) => void;
  openInterrupt: AgUiOpenInterruptMetadata;
}

export function CopilotDrawerInterruptBanner({
  injected,
  onFrontendToolInterruptApprove,
  onFrontendToolInterruptReject,
  openInterrupt,
}: CopilotDrawerInterruptBannerProps) {
  return (
    <div className="shrink-0 border-b px-3 py-3">
      <CopilotOpenInterruptBanner
        onDecisionChoose={(artifactId, choiceId, choiceLabel, interruptId) => {
          injected.resumeInterrupt?.({
            artifactId,
            choiceId,
            choiceLabel,
            interruptId,
          });
        }}
        onFrontendToolApprove={(open) => {
          if (onFrontendToolInterruptApprove) {
            void onFrontendToolInterruptApprove(open);
          }
        }}
        onFrontendToolReject={(open) => {
          if (onFrontendToolInterruptReject) {
            onFrontendToolInterruptReject(open);
          } else if (open.tool_name) {
            injected.resumeInterrupt?.({
              approved: false,
              interruptId: open.interrupt_id,
              toolName: open.tool_name,
            });
          }
        }}
        open={openInterrupt}
      />
    </div>
  );
}
