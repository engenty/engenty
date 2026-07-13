import { z } from "zod";

/**
 * Minimal MCP client over streamable HTTP for imported MCP connectors:
 * initialize → (tools/list | tools/call) in one short-lived session. Mirrors
 * the JSON-RPC shapes of `apps/ai/src/ai/mcp-apps/http-client.ts` but lives
 * here because it must run inside the module (server-side, per-connection
 * credentials), not in the AI app.
 */

export const MCP_PROTOCOL_VERSION = "2025-06-18";

const REQUEST_TIMEOUT_MS = 30_000;

const jsonRpcResponseSchema = z
  .object({
    error: z
      .object({ code: z.number(), message: z.string() })
      .loose()
      .nullish(),
    id: z.union([z.string(), z.number()]).nullish(),
    result: z.unknown().nullish(),
  })
  .loose();

export const mcpToolSchema = z
  .object({
    annotations: z
      .object({
        destructiveHint: z.boolean().optional(),
        readOnlyHint: z.boolean().optional(),
      })
      .loose()
      .nullish(),
    description: z.string().nullish(),
    inputSchema: z.record(z.string(), z.unknown()).nullish(),
    name: z.string(),
    title: z.string().nullish(),
  })
  .loose();

export type McpTool = z.infer<typeof mcpToolSchema>;

export class McpRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpRequestError";
  }
}

async function postJsonRpc(params: {
  body: Record<string, unknown>;
  endpoint: string;
  fetchImpl: typeof fetch;
  headers: Record<string, string>;
  sessionId?: string | null;
}): Promise<{ result: unknown; sessionId: string | null }> {
  const response = await params.fetchImpl(params.endpoint, {
    body: JSON.stringify(params.body),
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "mcp-protocol-version": MCP_PROTOCOL_VERSION,
      ...(params.sessionId ? { "mcp-session-id": params.sessionId } : {}),
      ...params.headers,
    },
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const sessionId = response.headers.get("mcp-session-id");
  const text = await response.text();
  if (!response.ok) {
    throw new McpRequestError(
      `MCP request failed (${response.status}): ${text.slice(0, 500)}`
    );
  }
  // Notifications (no id) return 202/empty bodies.
  if (!text.trim()) {
    return { result: null, sessionId };
  }
  // Streamable HTTP may answer as a single-message SSE stream.
  let payload = text;
  if (text.startsWith("event:") || text.includes("\ndata:")) {
    const dataLine = text.split("\n").find((line) => line.startsWith("data:"));
    payload = dataLine ? dataLine.slice("data:".length).trim() : "";
  }
  const parsed = jsonRpcResponseSchema.parse(JSON.parse(payload));
  if (parsed.error) {
    throw new McpRequestError(
      `MCP error ${parsed.error.code}: ${parsed.error.message}`
    );
  }
  return { result: parsed.result ?? null, sessionId };
}

/** initialize + notifications/initialized; returns the session id (if any). */
async function initializeSession(params: {
  endpoint: string;
  fetchImpl: typeof fetch;
  headers: Record<string, string>;
}): Promise<string | null> {
  const { sessionId } = await postJsonRpc({
    body: {
      id: 1,
      jsonrpc: "2.0",
      method: "initialize",
      params: {
        capabilities: {},
        clientInfo: { name: "engenty-connections-external", version: "0.0.1" },
        protocolVersion: MCP_PROTOCOL_VERSION,
      },
    },
    ...params,
  });
  await postJsonRpc({
    body: { jsonrpc: "2.0", method: "notifications/initialized" },
    sessionId,
    ...params,
  });
  return sessionId;
}

export async function mcpListTools(params: {
  endpoint: string;
  fetchImpl?: typeof fetch;
  headers?: Record<string, string>;
}): Promise<McpTool[]> {
  const ctx = {
    endpoint: params.endpoint,
    fetchImpl: params.fetchImpl ?? fetch,
    headers: params.headers ?? {},
  };
  const sessionId = await initializeSession(ctx);
  const { result } = await postJsonRpc({
    body: { id: 2, jsonrpc: "2.0", method: "tools/list", params: {} },
    sessionId,
    ...ctx,
  });
  const tools = z
    .object({ tools: z.array(mcpToolSchema).default([]) })
    .loose()
    .parse(result ?? {}).tools;
  return tools;
}

export async function mcpCallTool(params: {
  args: Record<string, unknown>;
  endpoint: string;
  fetchImpl?: typeof fetch;
  headers?: Record<string, string>;
  toolName: string;
}): Promise<unknown> {
  const ctx = {
    endpoint: params.endpoint,
    fetchImpl: params.fetchImpl ?? fetch,
    headers: params.headers ?? {},
  };
  const sessionId = await initializeSession(ctx);
  const { result } = await postJsonRpc({
    body: {
      id: 3,
      jsonrpc: "2.0",
      method: "tools/call",
      params: { arguments: params.args, name: params.toolName },
    },
    sessionId,
    ...ctx,
  });
  return result;
}
