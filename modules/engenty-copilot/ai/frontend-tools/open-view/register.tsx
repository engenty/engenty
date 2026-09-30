import type { JsonValue } from "@engenty/ag-ui-bridge";
import {
  openViewInPane,
  useEngentyFrontendTool,
  viewPathMatches,
} from "@engenty/ai-ui";
import { useUiContributions } from "@engenty/ui-plugin-sdk";
import { useNavigate } from "react-router-dom";
import { OPEN_VIEW_SPEC } from "./definition.js";
import { runOpenViewFrontendTool } from "./run.js";

export function useRegisterOpenViewFrontendTool(options?: {
  openCopilotShell?: () => void;
}): void {
  const navigate = useNavigate();
  const { contributions, ready } = useUiContributions();
  useEngentyFrontendTool({
    ...OPEN_VIEW_SPEC,
    handler: (input) =>
      runOpenViewFrontendTool(input, {
        navigate: (path) => {
          navigate(path);
          options?.openCopilotShell?.();
        },
        openInPane: (view, opts) => openViewInPane(view, opts) !== null,
        // Before the route table resolves, do not refuse every path.
        ...(ready
          ? {
              pathMatches: (path) =>
                viewPathMatches(path, contributions.routes),
            }
          : {}),
      }) as unknown as JsonValue,
  });
}
