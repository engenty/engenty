import { z } from "zod";
import { createGuardedFetch } from "../net/guarded-fetch.js";
import type { McpTransport } from "../types.js";

/**
 * Adapter over the official MCP client (`@modelcontextprotocol/client`) for
 * imported MCP connectors. It owns three things and nothing else:
 *
 * - **transport choice** — streamable HTTP by default; SSE only when the
 *   registry declares that transport or an admin picked it for a legacy URL,
 *   and as the fallback when a server rejects the streamable handshake;
 * - **credentials** — Connections resolves the connection's token and this
 *   module turns it into request headers; the SDK's own OAuth provider is
 *   deliberately not used, since grants live in the connections store;
 * - **session lifetime** — every call opens a client and releases it in
 *   `finally`: the streamable transport's session is terminated (DELETE) and
 *   the client closed, so a failed `tools/call` never leaks a server-side
 *   session.
 *
 * Every request the SDK makes goes through the injected guarded fetch, so an
 * MCP endpoint cannot be pointed at a private address.
 */

const REQUEST_TIMEOUT_MS = 30_000;

const CLIENT_INFO = {
  name: "engenty-connections-external",
  version: "0.0.1",
} as const;

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
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "McpRequestError";
    this.status = status;
  }
}

function httpStatusFromUnknown(error: unknown): number | null {
  if (error instanceof McpRequestError && error.status !== null) {
    return error.status;
  }
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === "number" && code >= 400 && code < 600) {
      return code;
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  const http = message.match(/\bHTTP\s+(\d{3})\b/iu);
  if (http) {
    return Number(http[1]);
  }
  const unauthorized = message.match(/\b(401)\b/u);
  return unauthorized ? Number(unauthorized[1]) : null;
}

/** Anonymous MCP handshake / tools/list was refused as unauthorized. */
export function isUnauthorizedMcpError(error: unknown): boolean {
  if (httpStatusFromUnknown(error) === 401) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /\b401\b|unauthorized/iu.test(message);
}

export interface McpSessionParams {
  endpoint: string;
  /** Injectable for tests; defaults to a guarded fetch. */
  fetchImpl?: typeof fetch;
  /** Credential + required headers, already rendered by the caller. */
  headers?: Record<string, string>;
  /** Declared transport; streamable HTTP when unknown. */
  transport?: McpTransport | null;
}

/** Streamable HTTP keeps server-side state that outlives `close()`. */
interface McpTransportLike {
  terminateSession?: () => Promise<void>;
}

interface McpClientLike {
  callTool: (
    params: { arguments?: Record<string, unknown>; name: string },
    options?: { timeout?: number }
  ) => Promise<unknown>;
  close: () => Promise<void>;
  connect: (transport: unknown) => Promise<void>;
  listTools: (
    params?: Record<string, unknown>,
    options?: { timeout?: number }
  ) => Promise<{ tools: unknown[] }>;
}

/**
 * Transport factories are resolved lazily so the SDK (and its OAuth/JOSE
 * dependency tree) is loaded only when an MCP connector actually runs.
 */
async function connectClient(
  params: McpSessionParams,
  transport: McpTransport
): Promise<{ client: McpClientLike; transport: McpTransportLike }> {
  const sdk = await import("@modelcontextprotocol/client");
  const url = new URL(params.endpoint);
  const options = {
    fetch: params.fetchImpl ?? createGuardedFetch(),
    requestInit: params.headers ? { headers: params.headers } : undefined,
  };
  const clientTransport =
    transport === "sse"
      ? new sdk.SSEClientTransport(url, options)
      : new sdk.StreamableHTTPClientTransport(url, options);
  const client = new sdk.Client(CLIENT_INFO) as unknown as McpClientLike;
  await client.connect(clientTransport);
  return { client, transport: clientTransport as McpTransportLike };
}

/**
 * Run `fn` against a connected client, closing the session in `finally`.
 * A streamable-HTTP server that refuses the handshake is retried once over
 * SSE — the legacy transport many hosted servers still answer on.
 */
async function withMcpClient<T>(
  params: McpSessionParams,
  fn: (client: McpClientLike) => Promise<T>
): Promise<T> {
  const declared = params.transport ?? "streamable-http";
  const attempts: McpTransport[] =
    declared === "sse" ? ["sse"] : ["streamable-http", "sse"];

  let lastError: unknown;
  for (const transport of attempts) {
    let session: { client: McpClientLike; transport: McpTransportLike };
    try {
      session = await connectClient(params, transport);
    } catch (error) {
      lastError = error;
      continue;
    }
    try {
      return await fn(session.client);
    } catch (error) {
      throw new McpRequestError(
        error instanceof Error ? error.message : String(error),
        httpStatusFromUnknown(error)
      );
    } finally {
      // Best effort in both steps: the session is already gone if either
      // fails, and neither may mask the caller's own error.
      await session.transport.terminateSession?.().catch(() => {
        // Server does not allow client-side termination.
      });
      await session.client.close().catch(() => {
        // Already closed.
      });
    }
  }
  throw new McpRequestError(
    `cannot connect to MCP server ${params.endpoint}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
    httpStatusFromUnknown(lastError)
  );
}

export async function mcpListTools(
  params: McpSessionParams
): Promise<McpTool[]> {
  return await withMcpClient(params, async (client) => {
    const result = await client.listTools(undefined, {
      timeout: REQUEST_TIMEOUT_MS,
    });
    return z
      .object({ tools: z.array(mcpToolSchema).default([]) })
      .loose()
      .parse(result ?? {}).tools;
  });
}

export async function mcpCallTool(
  params: McpSessionParams & {
    args: Record<string, unknown>;
    toolName: string;
  }
): Promise<unknown> {
  return await withMcpClient(params, (client) =>
    client.callTool(
      { arguments: params.args, name: params.toolName },
      { timeout: REQUEST_TIMEOUT_MS }
    )
  );
}
