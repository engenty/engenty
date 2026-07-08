import type { AgUiOpenInterruptMetadata } from "@engenty/ag-ui-bridge";
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

/**
 * Auto-runs an AG-UI frontend tool the moment its interrupt opens — the
 * browser executes the handler and resumes, with no approval UI. Frontend
 * tools never gate on user confirmation: risk lives in action semantics
 * (guarded by connector approval policies / prompts), not the tool dispatch.
 * Mount once per session (the hook is idempotent per interrupt id via
 * `handledRef`).
 */
export function useAutoResolveFrontendTool(params: {
  activeThreadId: string | null;
  awaitingInterrupt: boolean;
  executeFrontendTool: CopilotOpenInterruptExecuteFrontendTool;
  openInterrupt: AgUiOpenInterruptMetadata | null;
  resumeInterrupt: CopilotOpenInterruptResumeInterrupt;
}): void {
  const {
    activeThreadId,
    awaitingInterrupt,
    executeFrontendTool,
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
        !isAgUiOpenInterruptExpired(openInterrupt)
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
    openInterrupt,
    resumeInterrupt,
  ]);
}
