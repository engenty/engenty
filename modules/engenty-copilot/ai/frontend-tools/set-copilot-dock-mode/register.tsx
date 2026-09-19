import { useEngentyFrontendTool } from "@engenty/ai-ui";
import type { CopilotDockMode } from "@engenty/app-shell";
import { remapPersistedDockMode } from "@engenty/app-shell";
import { SET_COPILOT_DOCK_MODE_SPEC } from "./definition.js";

export function useRegisterSetCopilotDockModeFrontendTool(options: {
  setOpen?: (open: boolean) => void;
  setPreferredDockMode?: (mode: CopilotDockMode | null) => void;
}): void {
  useEngentyFrontendTool({
    ...SET_COPILOT_DOCK_MODE_SPEC,
    handler: ({ dock_mode }) => {
      if (dock_mode === "mini-floating") {
        options.setPreferredDockMode?.(null);
        options.setOpen?.(false);
        return { ok: true };
      }
      const live = remapPersistedDockMode(dock_mode) ?? "sidebar";
      options.setPreferredDockMode?.(live);
      options.setOpen?.(true);
      return { ok: true };
    },
  });
}
