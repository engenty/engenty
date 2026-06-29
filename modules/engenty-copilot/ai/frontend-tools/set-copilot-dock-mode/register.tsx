import { useEngentyFrontendTool } from "@engenty/ai-ui";
import type { CopilotDockMode } from "@engenty/app-shell";
import { SET_COPILOT_DOCK_MODE_SPEC } from "./definition.js";

export function useRegisterSetCopilotDockModeFrontendTool(options: {
  setPreferredDockMode?: (mode: CopilotDockMode | null) => void;
}): void {
  useEngentyFrontendTool({
    ...SET_COPILOT_DOCK_MODE_SPEC,
    handler: ({ dock_mode }) => {
      options.setPreferredDockMode?.(dock_mode);
      return { ok: true };
    },
  });
}
