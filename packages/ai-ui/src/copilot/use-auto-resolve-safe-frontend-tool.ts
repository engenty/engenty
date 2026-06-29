import type {
  AgUiOpenInterruptMetadata,
  FrontendToolDefinition,
} from "@engenty/ag-ui-bridge";
import {
  isAgUiOpenInterruptExpired,
  isFrontendToolOpenInterrupt,
} from "@engenty/ag-ui-bridge";
import { useEffect, useRef } from "react";
import {
  approveCopilotOpenInterrupt,
  type CopilotOpenInterruptExecuteFrontendTool,
  type CopilotOpenInterruptResumeInterrupt,
} from "./approve-copilot-open-interrupt.js";

/** A frontend tool is "safe" (no user confirmation) unless it opts into confirmation. */
function isSafeFrontendToolInterrupt(
  open: AgUiOpenInterruptMetadata,
  frontendTools: readonly FrontendToolDefinition[]
): boolean {
  const tool = frontendTools.find((entry) => entry.name === open.tool_name);
  return Boolean(
    tool && tool.metadata.engenty.safety !== "requires_confirmation"
  );
}

/**
 * Auto-runs a SAFE AG-UI frontend tool the moment its interrupt opens — the
 * browser executes the handler and resumes, with no approval UI. Confirmation
 * tools are left for the docked chooser. Mount once per session (the hook is
 * idempotent per interrupt id via `handledRef`). This replaces the old
 * TOOL_CALL_END dispatch→POST side-channel: safe tools now ride the same
 * interrupt/resume path as confirmation tools.
 */
export function useAutoResolveSafeFrontendTool(params: {
  activeThreadId: string | null;
  awaitingInterrupt: boolean;
  executeFrontendTool: CopilotOpenInterruptExecuteFrontendTool;
  frontendTools: readonly FrontendToolDefinition[];
  openInterrupt: AgUiOpenInterruptMetadata | null;
  resumeInterrupt: CopilotOpenInterruptResumeInterrupt;
}): void {
  const {
    activeThreadId,
    awaitingInterrupt,
    executeFrontendTool,
    frontendTools,
    openInterrupt,
    resumeInterrupt,
  } = params;
  const handledRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (
      !(
        awaitingInterrupt &&
        openInterrupt &&
        isFrontendToolOpenInterrupt(openInterrupt) &&
        !isAgUiOpenInterruptExpired(openInterrupt) &&
        isSafeFrontendToolInterrupt(openInterrupt, frontendTools)
      )
    ) {
      return;
    }
    const key = openInterrupt.interrupt_id;
    if (handledRef.current.has(key)) {
      return;
    }
    handledRef.current.add(key);
    void approveCopilotOpenInterrupt({
      activeThreadId,
      executeFrontendTool,
      open: openInterrupt,
      resumeInterrupt,
    });
  }, [
    activeThreadId,
    awaitingInterrupt,
    executeFrontendTool,
    frontendTools,
    openInterrupt,
    resumeInterrupt,
  ]);
}
