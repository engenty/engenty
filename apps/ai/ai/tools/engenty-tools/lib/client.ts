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
      ...(ctx.taskId ? { taskId: ctx.taskId } : {}),
      ...(ctx.triggerId ? { triggerId: ctx.triggerId } : {}),
    }),
  };
}
