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

export interface McpAppToolResult {
  _meta: {
    engenty: {
      mcp_app: {
        html?: string;
        resource_uri?: string;
        server_id: string;
        server_label: string;
        server_url: string;
        tool_name: string;
      };
    };
  };
  content: Array<{ text: string; type: "text" }>;
  ok: boolean;
  result: unknown;
}

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
      "mcp-protocol-version": "2025-11-25",
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

function readResourceHtml(result: unknown): string | undefined {
  if (!(isRecord(result) && Array.isArray(result.contents))) {
    return;
  }
  for (const content of result.contents) {
    if (isRecord(content) && typeof content.text === "string") {
      return content.text;
    }
  }
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

function demoEventsHtml(config: McpAppToolConfig, text: string) {
  const escapedTitle = config.serverLabel.replace(/[<>&"]/g, "");
  const escapedText = text.replace(/[<>&"]/g, "");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    body { margin: 0; font: 14px system-ui, sans-serif; color: #101828; background: #fff; }
    main { padding: 12px; display: grid; gap: 8px; }
    h1 { margin: 0 0 2px; font-size: 14px; font-weight: 650; }
    article { border: 1px solid #d0d5dd; border-radius: 8px; padding: 10px; background: #fcfcfd; }
    .time { color: #667085; font-size: 12px; }
  </style>
</head>
<body>
  <main>
    <h1>${escapedTitle} events</h1>
    <article><strong>Kickoff</strong><div class="time">09:00</div></article>
    <article><strong>Customer follow-up</strong><div class="time">11:30</div></article>
    <article><strong>Resolution review</strong><div class="time">15:00</div></article>
    <p class="time">${escapedText}</p>
  </main>
</body>
</html>`;
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
  let html: string | undefined;
  if (resourceUri) {
    html = readResourceHtml(
      await postJsonRpc(config.serverUrl, "resources/read", {
        uri: resourceUri,
      })
    );
  }
  const renderedHtml = html ?? demoEventsHtml(config, text);
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
          html: renderedHtml,
          resource_uri: resourceUri,
          server_id: config.serverId,
          server_label: config.serverLabel,
          server_url: config.serverUrl,
          tool_name: config.toolName,
        },
      },
    },
  };
}
