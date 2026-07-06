import type {
  ConnectorAction,
  ConnectorActionContext,
  ConnectorActionGroup,
} from "@engenty/connections-sdk";
import type { z } from "zod";

/**
 * Typed action builder: `ConnectorAction[]` erases the input type to
 * `unknown`, so handlers written against concrete inputs would violate
 * strictFunctionTypes. This wrapper parses the raw input with the action's
 * zod schema (also applying schema defaults) before invoking the typed `run`.
 */
export function action<S extends z.ZodType>(def: {
  description: string;
  group: ConnectorActionGroup;
  id: string;
  inputSchema: S;
  providerScopes: string[];
  run: (
    input: z.output<S>,
    ctx: ConnectorActionContext
  ) => Promise<unknown> | unknown;
  summary: string;
}): ConnectorAction {
  return {
    description: def.description,
    group: def.group,
    handler: (raw, ctx) => def.run(def.inputSchema.parse(raw), ctx),
    id: def.id,
    inputSchema: def.inputSchema,
    providerScopes: def.providerScopes,
    summary: def.summary,
  };
}
