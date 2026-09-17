import { createHash } from "node:crypto";

/**
 * Shared MCP Apps `ui://` template registry. Core exposes these through
 * `resources/read`; the Engenty host and external MCP hosts load the same
 * documents. Templates are predeclared, size-capped, and never embed secrets.
 */

export const MCP_APP_TEMPLATE_MAX_BYTES = 262_144;
export const MCP_APP_RESOURCE_MIME = "text/html;profile=mcp-app";

export interface McpAppCsp {
  connectDomains?: string[];
  resourceDomains?: string[];
}

export interface McpAppTemplate {
  csp?: McpAppCsp;
  html: string;
  /** SHA-256 hex of `html`, filled on register when omitted. */
  integrity?: string;
  uri: string;
}

const templates = new Map<string, McpAppTemplate>();

export function hashTemplateHtml(html: string): string {
  return createHash("sha256").update(html).digest("hex");
}

export function registerMcpAppTemplate(template: McpAppTemplate): () => void {
  const bytes = Buffer.byteLength(template.html, "utf8");
  if (bytes > MCP_APP_TEMPLATE_MAX_BYTES) {
    throw new Error(
      `MCP App template ${template.uri} exceeds the ${MCP_APP_TEMPLATE_MAX_BYTES} byte limit`
    );
  }
  if (!template.uri.startsWith("ui://")) {
    throw new Error(
      `MCP App template URI must start with ui://: ${template.uri}`
    );
  }
  const stored: McpAppTemplate = {
    ...template,
    integrity: template.integrity ?? hashTemplateHtml(template.html),
  };
  templates.set(template.uri, stored);
  return () => {
    if (templates.get(template.uri) === stored) {
      templates.delete(template.uri);
    }
  };
}

export function getMcpAppTemplate(uri: string): McpAppTemplate | undefined {
  return templates.get(uri);
}

export function listMcpAppTemplates(): McpAppTemplate[] {
  return [...templates.values()].sort((a, b) => a.uri.localeCompare(b.uri));
}

export function clearMcpAppTemplatesForTests(): void {
  templates.clear();
}

/** Compact status card used when a client advertised MCP Apps. */
export const DEFAULT_OPERATION_RESULT_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Engenty operation</title>
    <style>
      :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif; }
      body { margin: 0; padding: 12px; }
      pre { margin: 0; white-space: pre-wrap; word-break: break-word; font-size: 12px; }
    </style>
  </head>
  <body>
    <pre id="status">Operation complete.</pre>
    <script type="module">
      const status = document.getElementById("status");
      window.addEventListener("message", (event) => {
        const data = event.data;
        if (!data || typeof data !== "object") return;
        const structured = data.params?.structuredContent ?? data.structuredContent;
        if (structured && status) {
          status.textContent = JSON.stringify(structured, null, 2);
        }
      });
    </script>
  </body>
</html>
`;

export function ensureDefaultOperationResultTemplate(): void {
  if (!templates.has("ui://engenty/operation-result.html")) {
    registerMcpAppTemplate({
      html: DEFAULT_OPERATION_RESULT_HTML,
      uri: "ui://engenty/operation-result.html",
    });
  }
}
