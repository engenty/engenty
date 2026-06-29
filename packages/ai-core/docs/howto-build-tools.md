---
title: "How-to: Build tools"
description: ToolExecutionContext, callGatewayMethod, and gateway scope for AI tools.
---

# How-to: Build tools

Tools are AI-callable functions. They receive `ToolExecutionContext` and can use `callGatewayMethod` for DAL/API access.

## Context

Defined in `packages/ai-core/ai/tools/context/types.ts` and re-exported from `packages/ai-core/src/tools/types.ts` as `ToolExecutionContext`:

```ts
interface ToolExecutionContext {
  action: string; // route key
  callGatewayMethod?: (
    name: string,
    input: unknown,
    opts?: { auth?: unknown }
  ) => Promise<unknown>;
  moduleId: string;
  scope: Record<string, unknown> | null; // e.g. { entityId, entity, currentModule }
  scopeId: string | null;
  tenantId: string | null;
}
```

`scope.currentModule` is used when the host passes the active module in tool scope (see module copilot integration docs).

## Layout (ai-core)

- **Implement** each tool or tool builder under `packages/ai-core/ai/tools/<kebab-name>/<kebab-name>-tool.ts` (same pattern as `web-search/web-search-tool.ts`, `engenty-api/engenty-api-tool.ts`, or adapter-backed builders such as `request-decision/request-decision-tool.ts`).
- **Optional** `packages/ai-core/ai/tools/<kebab-name>/index.ts` may re-export from `*-tool.ts` only (no logic in `index.ts`).
- **Re-export** from `packages/ai-core/src/tools/<kebab-name>.ts` with `export * from "../../ai/tools/<kebab-name>/…";` so `tsup` and the package root keep stable `src/` entrypoints.
- Shared tool context types live in `packages/ai-core/ai/tools/context/types.ts` (re-exported as `ToolExecutionContext` from `@engenty/ai-core`).

## Rules

1. **Use `callGatewayMethod`** for DAL/API calls. Do not import Supabase or HTTP clients in tools.
2. **Use `scope`** for module-specific context (e.g. `scope.entityId` for the current contact).
3. **Return structured data** – the AI receives the result. Use snake_case for field names.
4. **Keep tools non-fatal** – catch errors and return `{ error: string }` when possible so the agent loop continues.

## Example: Load contact

```ts
import type { ToolExecutionContext } from "@engenty/ai-core";
import { tool } from "ai";
import { z } from "zod";

export function buildLoadContactTool(ctx: ToolExecutionContext) {
  return tool({
    description: "Load the current contact record.",
    inputSchema: z.object({
      id: z.string().optional().describe("Contact ID (optional)"),
    }),
    execute: async ({ id }) => {
      const call = ctx.callGatewayMethod;
      if (!call) return { error: "Gateway not available" };

      const scope = ctx.scope as Record<string, unknown> | null;
      const contactId = id ?? (typeof scope?.entityId === "string" ? scope.entityId : undefined);
      if (!contactId) return { error: "No contact ID in scope or input" };

      const contact = await call("contacts_get", { id: contactId });
      return contact;
    },
  });
}
```

## Example: Artifact publisher

For tools that publish artifacts, require the artifact writer and fail loudly if it is missing:

```ts
execute: async ({ suggestions }, executionOptions) => {
  const writer = getWriter(executionOptions);
  const stream = myArtifact.stream({ suggestions: [] }, writer);
  await stream.update({ suggestions });
  await stream.complete({ suggestions });
  return { ok: true, artifact_emitted: true };
}
```
