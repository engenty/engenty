import { useEngentyFrontendTool } from "@engenty/ai-ui";
import type { AgentUiFrontendToolHandler } from "@engenty/app-shell";
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { NAVIGATE_SPEC } from "./definition.js";
import { runNavigateFrontendTool } from "./run.js";

export function useNavigateFrontendToolExecutor(): AgentUiFrontendToolHandler {
  const navigate = useNavigate();
  return useCallback(
    (input, _request) => runNavigateFrontendTool(input, navigate),
    [navigate]
  );
}

export function useRegisterNavigateFrontendTool(options?: {
  openCopilotShell?: () => void;
}): void {
  const navigate = useNavigate();
  // run.js stays the execution authority (internal-path security checks); the zod
  // schema only types the args the agent sees.
  useEngentyFrontendTool({
    ...NAVIGATE_SPEC,
    handler: (input) =>
      runNavigateFrontendTool(input, navigate, {
        onNavigate: () => options?.openCopilotShell?.(),
      }),
  });
}
