import type { FrontendToolGrant } from "../../../ai/frontend-tools/catalog.js";
import { type RunSpaceResolution, resolvedRunSpace } from "./run-space.js";

/**
 * The page-driving grant for one agent on one run: its row's `uiTools` flag
 * plus whether the run's Space lists it as top-level (the coordinator).
 *
 * Null when the run has no config to read — a caller that could not load the
 * agent gets the plain worker answer (no frontend tools), never a guess.
 */
export function frontendToolGrantForRun(input: {
  agentId: string;
  config: { uiTools?: "auto" | "off" | "on" | null } | null | undefined;
  spaceResolution: RunSpaceResolution | null | undefined;
}): FrontendToolGrant | null {
  if (!input.config) {
    return null;
  }
  const runSpace = input.spaceResolution
    ? resolvedRunSpace(input.spaceResolution)
    : undefined;
  return {
    coordinator: Boolean(runSpace?.topLevelAgentIds?.has(input.agentId)),
    uiTools: input.config.uiTools ?? "auto",
  };
}
