import type { ToolExecutionContext } from "@mastra/core/tools";
import {
  EngentyCoreClient,
  getEngentyCoreBaseUrlFromEnv,
} from "../../../../src/ai/core-http-client.js";
import type { EngentyToolsClientResult } from "../schema/types.js";
import { resolveEngentyToolsRunContext } from "./run-context.js";

export function getCurrentEngentyToolsClient(
  executionContext?: ToolExecutionContext
): EngentyToolsClientResult {
  const ctx = resolveEngentyToolsRunContext(executionContext);
  const userAccessToken = ctx.userAccessToken?.trim();
  if (!userAccessToken) {
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
      userAccessToken,
      ...(ctx.agentId ? { agentId: ctx.agentId } : {}),
      ...(ctx.goalId ? { goalId: ctx.goalId } : {}),
    }),
  };
}
