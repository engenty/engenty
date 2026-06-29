import type { ToolExecutionContext } from "@mastra/core/tools";
import { getCurrentEngentyToolsClient } from "./lib/client.js";
import { coreErrorToToolResult } from "./lib/errors.js";
import { normalizeToolContract } from "./lib/format.js";
import {
  type DescribeEngentyToolInput,
  describeInputSchema,
} from "./schema/schemas.js";

export async function describeEngentyTool(
  input: DescribeEngentyToolInput,
  contextOrClient:
    | ToolExecutionContext
    | ReturnType<typeof getCurrentEngentyToolsClient>
    | undefined
) {
  const client =
    contextOrClient && "ok" in contextOrClient
      ? contextOrClient
      : getCurrentEngentyToolsClient(contextOrClient);
  if (!client.ok) {
    return client;
  }
  try {
    const parsed = describeInputSchema.parse(input);
    const entry = normalizeToolContract(
      await client.client.describeTool(parsed.id)
    );
    return {
      ok: true,
      entry,
      guidance:
        entry.auth.requiresApproval || entry.auth.riskLevel === "critical"
          ? "Ask the user before execution. If core returns approval_required, surface that request and stop."
          : "Use engenty_tool_execute only after the input is clear.",
    };
  } catch (err) {
    return coreErrorToToolResult(err);
  }
}
