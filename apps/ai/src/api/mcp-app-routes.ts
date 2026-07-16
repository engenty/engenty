import type { HonoBindings, HonoVariables } from "@mastra/hono";
import type { Context, Hono } from "hono";
import { z } from "zod";
import { callMcpServerTool } from "../ai/mcp-apps/http-client.js";
import { AI_BASE_PATH } from "../config/constants.js";
import {
  type AiScopeResolver,
  handleRouteError,
  resolveScope,
} from "./http.js";

/**
 * Bridge proxy for widget-initiated `tools/call` (MCP Apps postMessage
 * bridge). Every call a widget makes flows through here, authenticated as the
 * viewing user and validated against the tenant's *registered* MCP app
 * servers — a widget can only call tools on the server that produced it,
 * never arbitrary URLs.
 */

const callBodySchema = z.object({
  server_url: z.string().url().max(2048),
  tool_name: z.string().min(1).max(256),
  arguments: z.record(z.string(), z.unknown()).default({}),
});

export interface McpAppServerConfigSource {
  /** The tenant's registered MCP app server URLs (from the tool registry). */
  listServerUrls(tenantId: string): Promise<string[]>;
}

function normalizeServerUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

async function readJsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

export function registerMcpAppRoutes(
  app: Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>,
  opts: {
    scopeResolver: AiScopeResolver;
    serverConfigs: McpAppServerConfigSource;
  }
): void {
  app.post(`${AI_BASE_PATH}/mcp-apps/call`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const parsed = callBodySchema.safeParse(await readJsonBody(c));
    if (!parsed.success) {
      return c.json({ error: "mcpApps.invalidBody" }, 400);
    }
    try {
      const allowed = await opts.serverConfigs.listServerUrls(
        scope.scope.tenantId
      );
      const target = normalizeServerUrl(parsed.data.server_url);
      if (!allowed.some((url) => normalizeServerUrl(url) === target)) {
        return c.json({ error: "mcpApps.serverNotRegistered" }, 403);
      }
      const result = await callMcpServerTool({
        arguments: parsed.data.arguments,
        serverUrl: parsed.data.server_url,
        toolName: parsed.data.tool_name,
      });
      return c.json({ ok: true, result });
    } catch (err) {
      return handleRouteError(c, err);
    }
  });
}
