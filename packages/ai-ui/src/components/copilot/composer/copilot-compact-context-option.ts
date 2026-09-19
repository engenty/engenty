import type { CopilotRouteContext } from "../session/copilot-route-context.js";

export interface CopilotCompactContextOption {
  id: string;
  label: string;
  routeContext: CopilotRouteContext;
}
