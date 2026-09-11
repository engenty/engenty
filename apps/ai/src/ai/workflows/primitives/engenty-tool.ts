// `engenty_tool` — the graph's only door to module operations.
//
// A designer "Tool" node compiles to this primitive with `tool_id` + `input`.
// Execution rides the same core gateway invoker every agent tool call uses
// (`createScopeModuleOperationInvoker`), so the gateway's capability check
// applies unchanged: a graph is not a side door around CON-02/AUTH-06.
//
// The node-level allow list is intersected with the action-level one from the
// run context (narrowing only) BEFORE dispatch — save-time validation checks
// the same thing, this is the execute-time belt.
//
// Space policy is the same belt the catalog execute tool uses: discovery
// hiding (the contract is not visible in this Space) is not enforcement —
// this primitive still refuses an unmounted/unresolved operation at execute.
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getEngentyToolsRunContext } from "../../../../ai/tools/engenty-tools/lib/run-context.js";
import {
  checkOperationAgainstSpace,
  isToolVisibleInSpace,
  isUnresolvedSpaceGate,
  type SpaceGateContext,
} from "../../../../ai/tools/engenty-tools/lib/space-gate.js";
import {
  EngentyCoreClient,
  getEngentyCoreBaseUrlFromEnv,
} from "../../core-http-client.js";
import { serviceScopeTokenRefresher } from "../../service-credential.js";
import { createScopeModuleOperationInvoker } from "../../sessions/task-workspace-hook.js";
import { scopeAccessToken } from "../../sessions/types.js";
import { ENGENTY_TOOL_PRIMITIVE_ID } from "../primitive-ids.js";
import { readGraphRunContext, resolveGraphRunScope } from "../run-context.js";

export { ENGENTY_TOOL_PRIMITIVE_ID } from "../primitive-ids.js";

const inputSchema = z.object({
  /** Core gateway operation id, e.g. `invoices_update`. */
  tool_id: z.string().min(1),
  /** Operation payload. Usually produced by an upstream mapping node. */
  input: z.record(z.string(), z.unknown()).default({}),
});

const outputSchema = z.object({
  output: z.unknown(),
  tool_id: z.string(),
});

export function createEngentyToolPrimitive() {
  return createTool({
    id: ENGENTY_TOOL_PRIMITIVE_ID,
    description:
      "Invoke an engenty module operation by id with the run's service scope.",
    inputSchema,
    outputSchema,
    execute: async (input, ctx) => {
      const runCtx = readGraphRunContext(ctx.requestContext);
      const allowed = runCtx.allowedToolIds;
      if (allowed && !allowed.includes(input.tool_id)) {
        // Loud, not silent: an out-of-allow-list node means the graph drifted
        // from what was validated at save time (or was never validated).
        throw new Error(
          `graph-action: tool "${input.tool_id}" is not in this action's allow list`
        );
      }
      const space = resolveGraphToolSpace(runCtx.space);
      const scope = await resolveGraphRunScope(runCtx);
      if (isUnresolvedSpaceGate(space)) {
        const refusal = checkOperationAgainstSpace({
          moduleId: "_module_operation",
          operationId: input.tool_id,
          readOnly: false,
          space,
        });
        return { output: refusal, tool_id: input.tool_id };
      }
      const contract = space
        ? await describeGraphTool(scope, input.tool_id, space)
        : null;
      if (space) {
        if (!contract) {
          return {
            output: {
              error: "no_tool_result",
              message:
                `This run could not load the contract for ${input.tool_id}, so it cannot prove the operation is allowed in this Space. ` +
                "Do not guess; report retrieval failure or retry once.",
              ok: false,
            },
            tool_id: input.tool_id,
          };
        }
        const refusal = checkOperationAgainstSpace({
          operationId: contract.operationId,
          readOnly: contract.readOnly,
          space,
          ...(contract.moduleId ? { moduleId: contract.moduleId } : {}),
        });
        if (refusal) {
          return { output: refusal, tool_id: input.tool_id };
        }
      }
      const output = await invokeGraphTool(
        scope,
        input.tool_id,
        input.input,
        space
      );
      return { output, tool_id: input.tool_id };
    },
  });
}

export function resolveGraphToolSpace(
  space: SpaceGateContext | null | undefined
): SpaceGateContext | null {
  if (space !== undefined) {
    return space;
  }
  return getEngentyToolsRunContext().space ?? null;
}

/**
 * Whether a graph node may SHOW this operation in the run's Space.
 *
 * Same rule as catalog discovery. Execute still calls
 * {@link checkOperationAgainstSpace} — hiding is not enforcement.
 */
export function isGraphToolVisibleInSpace(
  entry: { moduleId?: string; operationId: string },
  space?: SpaceGateContext | null
): boolean {
  return isToolVisibleInSpace(entry, space);
}

function describeGraphTool(
  scope: Parameters<typeof createScopeModuleOperationInvoker>[0],
  toolId: string,
  space: SpaceGateContext | null
): Promise<GraphToolContract | null> {
  const client = graphCoreClient(scope, space);
  if (!client) {
    return Promise.resolve(null);
  }
  return client
    .describeTool(toolId)
    .then((contract) => ({
      moduleId: contract.moduleId,
      operationId: contract.operationId ?? contract.toolId ?? toolId,
      readOnly: contract.readOnly ?? false,
    }))
    .catch(() => null);
}

async function invokeGraphTool(
  scope: Parameters<typeof createScopeModuleOperationInvoker>[0],
  toolId: string,
  input: Record<string, unknown>,
  space: SpaceGateContext | null
): Promise<unknown> {
  const spaceId =
    space && "spaceId" in space && typeof space.spaceId === "string"
      ? space.spaceId
      : undefined;
  if (spaceId) {
    const client = graphCoreClient(scope, space);
    if (client) {
      return client.invokeTool(toolId, input);
    }
  }
  return createScopeModuleOperationInvoker(scope)(toolId, input);
}

interface GraphToolContract {
  moduleId?: string;
  operationId: string;
  readOnly: boolean;
}

function graphCoreClient(
  scope: Parameters<typeof createScopeModuleOperationInvoker>[0],
  space: SpaceGateContext | null
): EngentyCoreClient | null {
  const accessToken = scopeAccessToken(scope)?.trim();
  const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
  if (!(accessToken && coreBaseUrl)) {
    return null;
  }
  const spaceId =
    space && "spaceId" in space && typeof space.spaceId === "string"
      ? space.spaceId
      : undefined;
  const refreshAccessToken = serviceScopeTokenRefresher(scope);
  return new EngentyCoreClient({
    accessToken,
    coreBaseUrl,
    ...(spaceId ? { spaceId } : {}),
    ...(refreshAccessToken ? { refreshAccessToken } : {}),
  });
}
