/**
 * MCP Apps host, server side (spec: io.modelcontextprotocol/ui, rev
 * 2026-01-26). Calls a tool on a registered MCP server, resolves its declared
 * `ui://` template via `resources/read` (cached per server), and returns the
 * widget payload under `_meta.engenty.mcp_app` for the chat card to render in
 * a sandboxed iframe with the postMessage bridge.
 *
 * Re-check `_meta` key names against the core 2026-07-28 spec once it ships —
 * both the nested (`_meta.ui.resourceUri`) and legacy flat
 * (`_meta["ui/resourceUri"]`) forms are read here.
 */

export interface McpAppToolConfig {
  serverId: string;
  serverLabel: string;
  serverUrl: string;
  toolName: string;
}

export interface McpAppDiscoveredTool {
  description?: string;
  inputSchema?: Record<string, unknown>;
  name: string;
}

/** Declared widget CSP domains (resource `_meta.ui.csp`), host-enforced. */
export interface McpAppCsp {
  connectDomains?: string[];
  resourceDomains?: string[];
}

export interface McpAppToolResult {
  _meta?: {
    engenty: {
      mcp_app: {
        csp?: McpAppCsp;
        html?: string;
        resource_uri?: string;
        server_id: string;
        server_label: string;
        server_url: string;
        tool_name: string;
        /** Spec: UI-only payload, excluded from model context by the host. */
        structured_content?: unknown;
      };
    };
  };
  content: Array<{ text: string; type: "text" }>;
  ok: boolean;
  result: unknown;
}

const MCP_PROTOCOL_VERSION = "2025-11-25";
const TEMPLATE_MAX_BYTES = 1_048_576; // 1MB — templates are pre-declared docs, not data
const TEMPLATE_CACHE_TTL_MS = 5 * 60 * 1000;
const TEMPLATE_CACHE_MAX = 100;

interface JsonRpcResponse {
  error?: { code?: number; message?: string };
  result?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function postJsonRpc(
  url: string,
  method: string,
  params: Record<string, unknown>
): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "mcp-protocol-version": MCP_PROTOCOL_VERSION,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method,
      params,
    }),
  });
  if (!response.ok) {
    throw new Error(`MCP ${method} failed with HTTP ${response.status}`);
  }
  const payload = (await response.json()) as JsonRpcResponse;
  if (payload.error) {
    throw new Error(payload.error.message ?? `MCP ${method} failed`);
  }
  return payload.result;
}

function readTextContent(result: unknown): string {
  if (!(isRecord(result) && Array.isArray(result.content))) {
    return JSON.stringify(result ?? null);
  }
  const text = result.content
    .flatMap((part) =>
      isRecord(part) && part.type === "text" && typeof part.text === "string"
        ? [part.text]
        : []
    )
    .join("\n")
    .trim();
  return text || JSON.stringify(result);
}

function readResourceUri(result: unknown): string | undefined {
  if (!isRecord(result)) {
    return;
  }
  const meta = result._meta;
  if (!isRecord(meta)) {
    return;
  }
  const ui = meta.ui;
  if (isRecord(ui) && typeof ui.resourceUri === "string") {
    return ui.resourceUri;
  }
  const legacy = meta["ui/resourceUri"];
  return typeof legacy === "string" ? legacy : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return;
  }
  const strings = value.filter((v): v is string => typeof v === "string");
  return strings.length > 0 ? strings : undefined;
}

interface ResolvedTemplate {
  csp?: McpAppCsp;
  html: string;
}

function readTemplate(result: unknown): ResolvedTemplate | undefined {
  if (!(isRecord(result) && Array.isArray(result.contents))) {
    return;
  }
  for (const content of result.contents) {
    if (!(isRecord(content) && typeof content.text === "string")) {
      continue;
    }
    if (Buffer.byteLength(content.text, "utf8") > TEMPLATE_MAX_BYTES) {
      throw new Error("MCP App template exceeds the 1MB host limit");
    }
    const meta = isRecord(content._meta) ? content._meta : undefined;
    const ui = meta && isRecord(meta.ui) ? meta.ui : undefined;
    const cspRaw = ui && isRecord(ui.csp) ? ui.csp : undefined;
    const csp: McpAppCsp | undefined = cspRaw
      ? {
          ...(readStringArray(cspRaw.connectDomains)
            ? { connectDomains: readStringArray(cspRaw.connectDomains) }
            : {}),
          ...(readStringArray(cspRaw.resourceDomains)
            ? { resourceDomains: readStringArray(cspRaw.resourceDomains) }
            : {}),
        }
      : undefined;
    return { html: content.text, ...(csp ? { csp } : {}) };
  }
}

// Template pre-declaration: ui:// resources are static documents; cache them
// per (server, uri) so repeated tool calls don't re-fetch, and so a server
// can't swap the template mid-conversation unnoticed within the TTL.
const templateCache = new Map<
  string,
  { fetchedAt: number; template: ResolvedTemplate }
>();

async function resolveTemplate(
  serverUrl: string,
  resourceUri: string
): Promise<ResolvedTemplate | undefined> {
  const key = `${serverUrl}|${resourceUri}`;
  const cached = templateCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < TEMPLATE_CACHE_TTL_MS) {
    return cached.template;
  }
  const template = readTemplate(
    await postJsonRpc(serverUrl, "resources/read", { uri: resourceUri })
  );
  if (template) {
    if (templateCache.size >= TEMPLATE_CACHE_MAX) {
      const oldest = templateCache.keys().next().value;
      if (oldest !== undefined) {
        templateCache.delete(oldest);
      }
    }
    templateCache.set(key, { fetchedAt: Date.now(), template });
  }
  return template;
}

export function clearMcpAppTemplateCacheForTests() {
  templateCache.clear();
}

export async function listMcpAppTools(
  serverUrl: string
): Promise<McpAppDiscoveredTool[]> {
  const result = await postJsonRpc(serverUrl, "tools/list", {});
  if (!(isRecord(result) && Array.isArray(result.tools))) {
    return [];
  }
  return result.tools.flatMap((tool): McpAppDiscoveredTool[] => {
    if (!isRecord(tool) || typeof tool.name !== "string") {
      return [];
    }
    return [
      {
        name: tool.name,
        ...(typeof tool.description === "string"
          ? { description: tool.description }
          : {}),
        ...(isRecord(tool.inputSchema)
          ? { inputSchema: tool.inputSchema }
          : {}),
      },
    ];
  });
}

/**
 * Forward a widget-initiated `tools/call` to its MCP server (the bridge
 * proxy). The caller (route) is responsible for validating the server against
 * the tenant's registered MCP app tools before invoking this.
 */
export async function callMcpServerTool(params: {
  arguments: Record<string, unknown>;
  serverUrl: string;
  toolName: string;
}): Promise<unknown> {
  return await postJsonRpc(params.serverUrl, "tools/call", {
    name: params.toolName,
    arguments: params.arguments,
  });
}

export async function callMcpAppTool(
  config: McpAppToolConfig,
  input: Record<string, unknown>
): Promise<McpAppToolResult> {
  const result = await postJsonRpc(config.serverUrl, "tools/call", {
    name: config.toolName,
    arguments: input,
  });
  const text = readTextContent(result);
  const resourceUri = readResourceUri(result);
  const template = resourceUri
    ? await resolveTemplate(config.serverUrl, resourceUri).catch(() => {
        // A broken template must not fail the tool call — the text result
        // stands on its own.
        return;
      })
    : undefined;

  if (!(resourceUri && template)) {
    // No declared widget: a plain tool result, no fabricated UI.
    return {
      ok: true,
      content: [{ type: "text", text }],
      result,
    };
  }

  const structuredContent = isRecord(result)
    ? result.structuredContent
    : undefined;

  return {
    ok: true,
    content: [
      {
        type: "text",
        text: "The interactive MCP App widget has been rendered in the chat.",
      },
    ],
    result,
    _meta: {
      engenty: {
        mcp_app: {
          html: template.html,
          resource_uri: resourceUri,
          server_id: config.serverId,
          server_label: config.serverLabel,
          server_url: config.serverUrl,
          tool_name: config.toolName,
          ...(template.csp ? { csp: template.csp } : {}),
          ...(structuredContent !== undefined
            ? { structured_content: structuredContent }
            : {}),
        },
      },
    },
  };
}
