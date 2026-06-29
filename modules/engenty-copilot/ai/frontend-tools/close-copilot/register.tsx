import { useEngentyFrontendTool } from "@engenty/ai-ui";
import { CLOSE_COPILOT_SPEC } from "./definition.js";

export function useRegisterCloseCopilotFrontendTool(options: {
  setOpen: (open: boolean) => void;
}): void {
  useEngentyFrontendTool({
    ...CLOSE_COPILOT_SPEC,
    handler: () => {
      options.setOpen(false);
      return { ok: true };
    },
  });
}
