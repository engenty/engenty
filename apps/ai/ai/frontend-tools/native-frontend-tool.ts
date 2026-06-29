import type { FrontendToolDefinition } from "@engenty/ag-ui-bridge";
import type { PublicSchema } from "@mastra/core/schema";
import { createTool } from "@mastra/core/tools";
import { jsonSchema } from "ai";
import { z } from "zod";

// AG-UI-native frontend tools: the LLM calls these by name with their real JSON
// schema (no invoke_frontend_tool meta-tool). The server does NOT execute them —
// `execute` suspends the Mastra run; the browser runs the handler and the result
// is injected on resume via `agent.resumeStreamUntilIdle`. Mirrors the sandbox
// command suspend/resume path. See plans/006-ag-ui-native-frontend-tools.md.

/** Payload persisted into the AG-UI open-interrupt when a frontend tool suspends. */
const frontendToolSuspendSchema = z.object({
  input: z.unknown(),
  tool_name: z.string(),
});

/** What the browser sends back on resume: the handler's output, or a rejection/error. */
const frontendToolResumeSchema = z.object({
  error: z.string().optional(),
  output: z.unknown().optional(),
  rejected: z.boolean().optional(),
});

export type FrontendToolResumeData = z.infer<typeof frontendToolResumeSchema>;

/**
 * Builds a native Mastra tool from an AG-UI frontend-tool definition. The tool
 * suspends on first call (browser executes), and returns the browser-provided
 * output when resumed.
 */
export function createNativeFrontendTool(definition: FrontendToolDefinition) {
  return createTool({
    id: definition.name,
    description: definition.description,
    // The real per-tool JSON schema — so the LLM sees enums/required fields and
    // passes correct arguments (no prose schema dump needed). Wrap with the AI SDK
    // `jsonSchema()` so Mastra carries the schema through to the model verbatim
    // (passing a bare object yields an empty model schema).
    inputSchema: jsonSchema(definition.parameters) as unknown as PublicSchema<
      Record<string, unknown>
    >,
    suspendSchema: frontendToolSuspendSchema,
    resumeSchema: frontendToolResumeSchema,
    execute: async (inputData, ctx) => {
      const resume = ctx.agent?.resumeData;
      if (resume) {
        if (resume.rejected) {
          throw new Error(
            `User rejected the frontend tool: ${definition.name}`
          );
        }
        if (resume.error) {
          throw new Error(resume.error);
        }
        return (resume.output ?? { ok: true }) as never;
      }
      await ctx.agent?.suspend({
        input: inputData,
        tool_name: definition.name,
      });
      // Unreachable once resumed (execute re-runs with resumeData set), but Mastra
      // requires a value/void return on the suspend path.
      return undefined as never;
    },
  });
}

/** Builds native tools for every enabled frontend-tool definition, keyed by name. */
export function createNativeFrontendTools(
  definitions: readonly FrontendToolDefinition[]
): Record<string, ReturnType<typeof createNativeFrontendTool>> {
  const tools: Record<string, ReturnType<typeof createNativeFrontendTool>> = {};
  for (const definition of definitions) {
    if (definition.metadata.engenty.availability !== "enabled") {
      continue;
    }
    tools[definition.name] = createNativeFrontendTool(definition);
  }
  return tools;
}
