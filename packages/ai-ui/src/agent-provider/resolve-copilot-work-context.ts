import type { EngentyAgUiRouteContext } from "../ag-ui/engenty-ag-ui-route-context.js";
import {
  type EngentyAgentAffinityKeyInput,
  resolveEngentyAgentAffinityStableSessionKey,
} from "./affinity.js";

export interface ResolveCopilotWorkContextStableSessionKeyInput {
  agentId: string;
  routeContext: EngentyAgUiRouteContext;
  tenantId: string | null | undefined;
  userId: string | null | undefined;
}

/** Copilot work-context affinity — same server session across drawer, panel `/new`, KB hub when scope matches. */
export function resolveCopilotWorkContextStableSessionKey(
  input: ResolveCopilotWorkContextStableSessionKeyInput
): string | null {
  const affinityInput: EngentyAgentAffinityKeyInput = {
    agentId: input.agentId,
    routeContext: input.routeContext,
    tenantId: input.tenantId,
    userId: input.userId,
  };
  return resolveEngentyAgentAffinityStableSessionKey(affinityInput);
}
