import { useEngentyFrontendTool } from "@engenty/ai-ui";
import { OPEN_COPILOT_SPEC } from "./definition.js";

export function useRegisterOpenCopilotFrontendTool(options: {
  openCopilotShell: () => void;
}): void {
  useEngentyFrontendTool({
    ...OPEN_COPILOT_SPEC,
    handler: () => {
      options.openCopilotShell();
      return { ok: true };
    },
  });
}
