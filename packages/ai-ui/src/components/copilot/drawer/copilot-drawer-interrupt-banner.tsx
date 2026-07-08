"use client";

import type { AgUiOpenInterruptMetadata } from "@engenty/ag-ui-bridge";
import { CopilotOpenInterruptBanner } from "../copilot-open-interrupt-banner";
import type { CopilotDrawerInjectedLane } from "./copilot-drawer-injected-lane.js";

export interface CopilotDrawerInterruptBannerProps {
  injected: CopilotDrawerInjectedLane;
  onSandboxCommandInterruptApprove?: (
    open: AgUiOpenInterruptMetadata
  ) => void | Promise<void>;
  onSandboxCommandInterruptReject?: (open: AgUiOpenInterruptMetadata) => void;
  openInterrupt: AgUiOpenInterruptMetadata;
}

export function CopilotDrawerInterruptBanner({
  injected,
  onSandboxCommandInterruptApprove,
  onSandboxCommandInterruptReject,
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
        onSandboxCommandApprove={(open) => {
          if (onSandboxCommandInterruptApprove) {
            void onSandboxCommandInterruptApprove(open);
          }
        }}
        onSandboxCommandReject={(open) => {
          if (onSandboxCommandInterruptReject) {
            onSandboxCommandInterruptReject(open);
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
