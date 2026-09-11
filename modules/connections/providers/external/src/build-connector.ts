import {
  type ConnectorAction,
  type ConnectorAuth,
  type ConnectorDefinition,
  decryptToken,
  defineConnector,
} from "@engenty/connections-sdk";
import { z } from "zod";
import { headersFromRequired } from "./import-service.js";
import { executeHttpAction } from "./invoke/http-invoker.js";
import { mcpCallTool } from "./invoke/mcp-client.js";
import type { ImportedConnectorRecord, NormalizedAction } from "./types.js";

/**
 * Materialize a stored import record into a live `ConnectorDefinition`. From
 * here on the framework owns everything — per-action operations, policy
 * defaults by group, approvals, accounts, audit — identical to a hand-written
 * provider.
 */

/**
 * MCP request headers: the connector's required headers first, then the
 * credential — auth must win a name collision, never the other way round.
 */
function mcpHeaders(
  record: ImportedConnectorRecord,
  accessToken: string
): Record<string, string> {
  const headers = headersFromRequired(record.required_headers);
  const auth = record.auth_config;
  if (auth.kind === "oauth2") {
    return { ...headers, authorization: `Bearer ${accessToken}` };
  }
  if (auth.kind === "api_key" && auth.placement.in === "header") {
    let credentials: Record<string, string> = {};
    try {
      credentials = JSON.parse(accessToken) as Record<string, string>;
    } catch {
      return headers;
    }
    const value = auth.placement.value_template.replace(
      /\{\{\s*([a-z0-9_]+)\s*\}\}/giu,
      (_m, key: string) => credentials[key] ?? ""
    );
    return { ...headers, [auth.placement.name]: value };
  }
  return headers;
}

function inputSchemaToZod(action: NormalizedAction): z.ZodType | null {
  try {
    const schema = z.fromJSONSchema(action.input_json_schema);
    return schema instanceof z.ZodObject ? schema : z.object({}).loose();
  } catch {
    return null;
  }
}

function buildAction(
  record: ImportedConnectorRecord,
  action: NormalizedAction,
  live: () => ImportedConnectorRecord
): ConnectorAction | null {
  const inputSchema = inputSchemaToZod(action);
  if (!inputSchema) {
    return null;
  }
  const group =
    action.classification === "read"
      ? "read"
      : action.classification === "destructive"
        ? "destructive"
        : "write";
  return {
    description: action.description.slice(0, 1024),
    group,
    handler: (input, ctx) => {
      // Read the record through the live resolver: refresh updates base_url/
      // auth without re-binding the already-registered operation closures.
      const current = live();
      const args = (input ?? {}) as Record<string, unknown>;
      if (action.invoke.kind === "mcp") {
        return mcpCallTool({
          args,
          endpoint: current.source_url,
          headers: mcpHeaders(current, ctx.accessToken),
          toolName: action.invoke.tool_name,
          transport: current.mcp_transport,
        });
      }
      return executeHttpAction({
        accessToken: ctx.accessToken,
        fetchImpl: ctx.fetchImpl,
        input: args,
        invoke: action.invoke,
        record: current,
      });
    },
    id: action.id,
    inputSchema,
    summary: action.summary.slice(0, 256),
  };
}

function buildAuth(
  record: ImportedConnectorRecord,
  live: () => ImportedConnectorRecord
): ConnectorAuth {
  const stored = record.auth_config;
  if (stored.kind === "oauth2") {
    return {
      kind: "oauth2",
      oauth2: {
        authUrl: stored.auth_url,
        baseScopes: stored.scopes,
        resolveClientCredentials: () => {
          const current = live();
          if (!(current.client_id_enc && current.client_secret_enc)) {
            return Promise.reject(
              new Error(
                `imported connector ${current.id} has no OAuth client credentials — set them in the import console`
              )
            );
          }
          return Promise.resolve({
            clientId: decryptToken(current.client_id_enc),
            clientSecret: decryptToken(current.client_secret_enc),
          });
        },
        scopeSeparator: stored.scope_separator ?? " ",
        tokenUrl: stored.token_url,
      },
    };
  }
  if (stored.kind === "api_key") {
    return {
      apiKey: {
        fields: stored.fields.map((field) => ({
          key: field.key,
          label: field.label,
          required: field.required ?? true,
          secret: field.secret ?? true,
        })),
        // No live probe on connect: imported specs give no reliable cheap
        // "whoami" endpoint; a bad key surfaces on first action instead.
        verify: (credentials) => {
          for (const field of stored.fields) {
            if ((field.required ?? true) && !credentials[field.key]) {
              return Promise.reject(
                new Error(`missing credential field "${field.key}"`)
              );
            }
          }
          return Promise.resolve({ label: record.domain });
        },
      },
      kind: "api_key",
    };
  }
  // "none": model as api_key with zero fields so connect works without input.
  return {
    apiKey: {
      fields: [],
      verify: () => Promise.resolve({ label: record.domain }),
    },
    kind: "api_key",
  };
}

export interface BuiltImportedConnector {
  connector: ConnectorDefinition;
  /** Actions whose JSON schema could not be converted; reported, not fatal. */
  skippedActions: string[];
}

export function buildImportedConnector(
  record: ImportedConnectorRecord,
  resolveLive?: () => ImportedConnectorRecord | undefined
): BuiltImportedConnector {
  const live = () => resolveLive?.() ?? record;
  const actions: ConnectorAction[] = [];
  const skippedActions: string[] = [];
  for (const normalized of record.actions) {
    const action = buildAction(record, normalized, live);
    if (action) {
      actions.push(action);
    } else {
      skippedActions.push(normalized.id);
    }
  }
  const connector = defineConnector({
    actions,
    auth: buildAuth(record, live),
    description: `${record.name} — imported from ${record.domain} (${record.source_kind})`,
    icon: "plug",
    id: record.id,
    moduleId: "connections-external",
    name: record.name,
    toolPrefix: record.tool_prefix,
  });
  return { connector, skippedActions };
}
