import { isAgentUiStateSnapshotV1 } from "@engenty/ag-ui-bridge";
import { buildAgentSystemPromptFromUiState } from "@engenty/ai-core";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";
import { jsonApiError, jsonApiSuccess } from "./api-response.js";
import { resolveRouteAuth } from "./authz.js";

const agentSystemPromptBodySchema = z.object({
  agent_id: z.string().min(1),
  ui_state: z.record(z.string(), z.unknown()),
});

export function registerAiAgentSystemPromptRoutes(
  app: OpenAPIHono,
  config: Record<string, unknown>
) {
  app.post("/api/tools/agent-system-prompt", async (c) => {
    const auth = await resolveRouteAuth(c, config);
    if (!auth) {
      return jsonApiError(c, 401, { message: "Unauthorized" });
    }

    const parsed = agentSystemPromptBodySchema.safeParse(
      await c.req.json().catch(() => ({}))
    );
    if (!parsed.success) {
      return jsonApiError(c, 400, { message: "Invalid request body" });
    }

    if (!isAgentUiStateSnapshotV1(parsed.data.ui_state)) {
      return jsonApiError(c, 400, { message: "Invalid ui_state snapshot" });
    }

    const system_prompt = await buildAgentSystemPromptFromUiState(
      parsed.data.agent_id,
      parsed.data.ui_state
    );

    return jsonApiSuccess(c, { system_prompt });
  });
}
