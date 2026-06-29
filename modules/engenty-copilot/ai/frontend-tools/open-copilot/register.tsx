import { useEngentyFrontendTool } from "@engenty/ai-ui";
import { OPEN_COPILOT_SPEC } from "./definition.js";

export function useRegisterOpenCopilotFrontendTool(options: {
  setOpen: (open: boolean) => void;
}): void {
  useEngentyFrontendTool({
    ...OPEN_COPILOT_SPEC,
    handler: () => {
      options.setOpen(true);
      return { ok: true };
    },
  });
}
