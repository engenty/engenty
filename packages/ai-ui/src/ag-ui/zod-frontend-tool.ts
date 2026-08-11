/**
 * Client config for a zod-typed frontend tool: a server-safe spec (`@engenty/ag-ui-bridge`)
 * plus a browser `handler`. The handler receives validated, typed args — no manual
 * `readRecord`/validate — and the agent-facing JSON Schema is generated from the schema.
 *
 * Pure (no React) so it stays unit-testable on its own; the React hook lives in
 * `use-engenty-frontend-tool.ts`.
 */

import type {
  EngentyFrontendToolSpec,
  FrontendToolCallRequest,
  JsonValue,
} from "@engenty/ag-ui-bridge";
import type { AgentUiFrontendToolHandler } from "@engenty/app-shell";
import type { z } from "zod";

/** A frontend tool spec (zod schema + metadata) with a colocated browser handler. */
export interface EngentyZodFrontendToolConfig<TSchema extends z.ZodType>
  extends EngentyFrontendToolSpec<TSchema> {
  /**
   * False = withhold from the agent for now (see
   * `UseEngentyFrontendToolOptions.enabled`). Default true.
   */
  enabled?: boolean;
  /** Validated, typed args — no `readRecord`/manual validation. */
  handler: (
    input: z.infer<TSchema>,
    request: FrontendToolCallRequest
  ) => JsonValue | Promise<JsonValue>;
}

/** Narrow a `useEngentyFrontendTool` arg to the zod config form. */
export function isZodFrontendToolConfig(
  value: unknown
): value is EngentyZodFrontendToolConfig<z.ZodType> {
  return (
    typeof value === "object" &&
    value !== null &&
    "schema" in value &&
    "handler" in value &&
    "name" in value
  );
}

/**
 * Recursively drop `null` values so an omitted optional arg validates. Models
 * routinely emit `null` for optional params they don't use (e.g.
 * `root_selector: null`), but `z.string().optional()` accepts only `undefined`,
 * not `null` — so the parse would throw and the tool would "fail". Dropping the
 * key makes the field absent, matching `.optional()`. A `null` for a REQUIRED
 * field still fails validation (the key is gone → "required").
 */
export function dropNullArgs(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(dropNullArgs);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      if (val === null) {
        continue;
      }
      out[key] = dropNullArgs(val);
    }
    return out;
  }
  return value;
}

/** Wrap a typed handler into the harness handler, parsing input via the schema. */
export function toAgentUiFrontendToolHandler<TSchema extends z.ZodType>(
  config: EngentyZodFrontendToolConfig<TSchema>
): AgentUiFrontendToolHandler {
  return (input, request) =>
    config.handler(
      config.schema.parse(dropNullArgs(input)) as z.infer<TSchema>,
      request
    );
}
