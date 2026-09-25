// connector_import_request: a remote MCP server an installer registered on
// this Space's computer becomes a tenant connector.
//
// Nothing on the computer runs `~/.claude.json`'s MCP servers, and a login
// there would need a browser the computer does not have. Imported as a
// connector, the server's tools become operations with a Space gate,
// approvals and audit, and its OAuth runs through the existing connect card
// in the person's own browser. Importing is a tenant-admin change: the person
// approves the card, core's import route checks they are an admin, and when
// they are not, the Space is asked in its inbox instead.

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getEngentyCoreBaseUrlFromEnv } from "../../src/ai/core-http-client.js";
import { openSpaceComputerHome } from "../../src/ai/sandbox/space-computer-home.js";
import {
  listSpaceComputerMcpServers,
  type SpaceComputerMcpServer,
} from "../../src/ai/sandbox/space-computer-mcp.js";
import { executionSpaceId } from "../../src/ai/sessions/execution-lane.js";
import { emitInboxNotification } from "../../src/notifications/inbox.js";
import {
  gateRequiresApproval,
  type ToolApprovalSuspendPayload,
  toolApprovalResumeSchema,
  toolApprovalSuspendSchema,
} from "./engenty-tools/lib/execute-approval.js";
import {
  getEngentyToolsRunContext,
  type ToolRequestContextCarrier,
} from "./engenty-tools/lib/run-context.js";

export const CONNECTOR_IMPORT_REQUEST_TOOL_ID = "connector_import_request";

/** The subject of a `connector_import_requested` row; its id is the URL. */
export const CONNECTOR_IMPORT_SUBJECT = "connector_import";

/** Where an admin imports a connector by URL. */
const CONNECTOR_IMPORT_ROUTE = "/setup/connectors";

/** The grant an approval of this import writes — one per server URL. */
export function connectorImportOperationId(url: string): string {
  return `connector_import:${url}`;
}

/** A connector id and tool prefix core accepts, derived from the server name. */
export function connectorIdsFor(name: string): {
  id: string;
  toolPrefix: string;
} {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^[^a-z]+|-+$/g, "");
  const id = (base.length >= 2 ? base : `mcp-${base}`).slice(0, 60);
  const toolPrefix = id.replace(/-/g, "_").slice(0, 31).replace(/_+$/, "");
  return { id, toolPrefix };
}

function describeServers(servers: SpaceComputerMcpServer[]) {
  return {
    importable: servers
      .filter((s) => s.kind === "remote")
      .map(({ found_in, name, url }) => ({ found_in, name, url })),
    not_importable: servers
      .filter((s) => s.kind === "stdio")
      .map(({ found_in, name }) => ({
        found_in,
        name,
        reason:
          "Runs as a process on the computer (stdio), so it cannot become a connector.",
      })),
  };
}

async function importConnector(input: {
  accessToken: string;
  coreBaseUrl: string;
  name: string;
  url: string;
}): Promise<{ body: unknown; status: number }> {
  const { id, toolPrefix } = connectorIdsFor(input.name);
  const response = await fetch(
    new URL("/api/external-connectors/import", input.coreBaseUrl),
    {
      body: JSON.stringify({
        domain: new URL(input.url).hostname,
        id,
        name: input.name,
        source_kind: "mcp",
        source_url: input.url,
        tool_prefix: toolPrefix,
      }),
      headers: {
        Authorization: `Bearer ${input.accessToken.replace(/^Bearer\s+/i, "")}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    }
  );
  const body = await response.json().catch(() => null);
  return { body, status: response.status };
}

function errorText(body: unknown): string | null {
  const error = (body as { error?: unknown } | null)?.error;
  return typeof error === "string" ? error : null;
}

export const connectorImportRequestTool = createTool({
  id: CONNECTOR_IMPORT_REQUEST_TOOL_ID,
  description:
    "List the MCP servers an installer registered on this Space's computer " +
    "(~/.claude.json, ~/.cursor/mcp.json, ~/.gemini/settings.json), or, " +
    "with `name`, ask to import a remote one as a connector so its tools " +
    "work here through approvals — a person approves first. Call it after " +
    "an installer adds an MCP server; nothing on the computer runs them. " +
    "After a successful import, offer the connect card with " +
    "connections_request_connect for the returned connector_id.",
  inputSchema: z.object({
    name: z
      .string()
      .max(120)
      .optional()
      .describe("Server name from the list. Omit to list what is there."),
  }),
  suspendSchema: toolApprovalSuspendSchema,
  resumeSchema: toolApprovalResumeSchema,
  execute: async (input, context) => {
    const ctx = getEngentyToolsRunContext();
    const tenantId = ctx.tenantId?.trim();
    const spaceId = ctx.space?.spaceId;
    const accessToken = ctx.accessToken?.trim();
    const coreBaseUrl = ctx.coreBaseUrl ?? getEngentyCoreBaseUrlFromEnv();
    if (!(tenantId && spaceId && accessToken && coreBaseUrl)) {
      return {
        ok: false as const,
        code: "not_in_space",
        message:
          "connector_import_request needs a run in a Space (there is no Space computer to look on).",
      };
    }
    const servers = await listSpaceComputerMcpServers(
      openSpaceComputerHome({ spaceId, tenantId })
    );
    const name = input.name?.trim();
    if (!name) {
      return { ok: true as const, ...describeServers(servers) };
    }
    const server = servers.find((s) => s.name === name);
    if (server?.kind !== "remote") {
      return {
        ok: false as const,
        code: server ? "not_importable" : "not_found",
        message: server
          ? `${name} runs as a process on the computer (stdio), so it cannot become a connector.`
          : `No MCP server named ${name} on this Space's computer.`,
        ...describeServers(servers),
      };
    }

    const operationId = connectorImportOperationId(server.url);
    const carrier = context as
      | ToolRequestContextCarrier<ToolApprovalSuspendPayload>
      | undefined;
    const resume = toolApprovalResumeSchema.safeParse(
      carrier?.agent?.resumeData
    );
    if (resume.success && !resume.data.approved) {
      return {
        ok: false as const,
        code: "approval_denied",
        message: `The person declined importing ${name}. Do not ask again in this conversation.`,
      };
    }
    const approved =
      (resume.success && resume.data.approved) ||
      (ctx.approvalGrants ?? []).includes(operationId);
    if (!approved) {
      return gateRequiresApproval({
        body:
          `${server.url} (found in ${server.found_in}). Its tools become ` +
          "operations this Space's agents can use once someone connects an " +
          "account — each call still behind approvals.",
        context: carrier,
        operationId,
        requiresApproval: true,
        riskLevel: "medium",
        title: `Import ${name} as a connector`,
      });
    }

    const { id } = connectorIdsFor(name);
    const imported = await importConnector({
      accessToken,
      coreBaseUrl,
      name,
      url: server.url,
    });
    if (imported.status === 200 || imported.status === 409) {
      return {
        ok: true as const,
        connector_id: id,
        status: imported.status === 200 ? "imported" : "already_imported",
        next: `Offer the connect card: engenty_tool_execute connections_request_connect with connector_id "${id}".`,
      };
    }
    if (imported.status === 403) {
      const proposedBy = ctx.agentTypeKey ?? ctx.agentId ?? null;
      await emitInboxNotification({
        actor: { id: proposedBy, kind: proposedBy ? "agent" : "system" },
        body: server.url,
        dedupeKey: `connector-import:${tenantId}:${server.url}`,
        kind: "connector_import_requested",
        metadata: {
          found_in: server.found_in,
          name,
          url: server.url,
          ...(proposedBy ? { agent_id: proposedBy } : {}),
        },
        priority: "medium",
        source: "agent",
        spaceId: executionSpaceId(ctx.space) ?? spaceId,
        subject: { id: server.url, type: CONNECTOR_IMPORT_SUBJECT },
        target: CONNECTOR_IMPORT_ROUTE,
        tenantId,
        title: { key: "connector_import_requested", params: { name } },
      });
      return {
        ok: false as const,
        code: "needs_admin",
        message: `Only a tenant admin can import connectors. The Space was asked in its inbox to import ${name} (${server.url}); tell the person that, and continue without it.`,
      };
    }
    return {
      ok: false as const,
      code: "import_failed",
      message:
        errorText(imported.body) ?? `Import failed (${imported.status}).`,
    };
  },
});

export function createConnectorImportRequestTools() {
  return { [CONNECTOR_IMPORT_REQUEST_TOOL_ID]: connectorImportRequestTool };
}
