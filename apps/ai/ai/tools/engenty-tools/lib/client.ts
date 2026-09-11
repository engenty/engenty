import {
  EngentyCoreClient,
  getEngentyCoreBaseUrlFromEnv,
} from "../../../../src/ai/core-http-client.js";
import type { EngentyToolsClientResult } from "../schema/types.js";
import {
  resolveEngentyToolsRunContext,
  type ToolRequestContextCarrier,
} from "./run-context.js";

export function getCurrentEngentyToolsClient(
  executionContext?: ToolRequestContextCarrier
): EngentyToolsClientResult {
  const ctx = resolveEngentyToolsRunContext(executionContext);
  const accessToken = ctx.accessToken?.trim();
  if (!accessToken) {
    return {
      ok: false,
      code: "unauthorized",
      message:
        "Core-backed Engenty tools are unavailable because this run does not include an end-user bearer token.",
    };
  }
  const coreBaseUrl = ctx.coreBaseUrl ?? getEngentyCoreBaseUrlFromEnv();
  if (!coreBaseUrl) {
    return {
      ok: false,
      code: "service_unavailable",
      message:
        "Core-backed Engenty tools are unavailable because ENGENTY_CORE_BASE_URL is not configured.",
    };
  }
  return {
    ok: true,
    client: new EngentyCoreClient({
      coreBaseUrl,
      fetchImpl: ctx.fetchImpl,
      accessToken,
      ...(ctx.agentId ? { agentId: ctx.agentId } : {}),
      ...(ctx.goalId ? { goalId: ctx.goalId } : {}),
      // CN.3 — the run's space, so core can narrow a connector call to the
      // ACCOUNTS this space mounts. The AI-side gate refuses an unmounted
      // connector before the call; this is the half that reaches the account,
      // which only core can see.
      ...(ctx.space?.spaceId ? { spaceId: ctx.space.spaceId } : {}),
      ...(ctx.taskId ? { taskId: ctx.taskId } : {}),
      ...(ctx.routineId ? { routineId: ctx.routineId } : {}),
      // Headless runs: re-mint + retry once when the service token expires
      // mid-run instead of losing every core-backed tool until the run ends.
      ...(ctx.refreshAccessToken
        ? { refreshAccessToken: ctx.refreshAccessToken }
        : {}),
    }),
  };
}
