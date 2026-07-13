import type {
  EngentyPluginApi,
  PluginServerOperation,
} from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type ZodType, z } from "zod";
import { executeConnectorAction } from "./execute.js";
import { filesCapabilityActions } from "./files-capability.js";
import { registerConnectorDefinition } from "./registry.js";
import { createConnectionsRepo } from "./repo.js";
import { storageCapabilityActions } from "./storage-capability.js";
import type { ConnectorAction, ConnectorDefinition } from "./types.js";
import { ACTION_GROUP_CONTRACTS, connectorOperationId } from "./types.js";

/**
 * Finalize a connector definition. When it declares a `files` capability, the
 * read actions (`files_list`/`files_read`/`files_stat`/`files_search`) are
 * synthesized and appended; a `storage` capability likewise synthesizes the
 * write actions (`files_write`/`files_delete`/`files_move`). They project as
 * gateway operations exactly like hand-written actions. The registry's
 * duplicate-id guard protects against a connector also hand-declaring a
 * `files_*` action.
 */
export function defineConnector(def: ConnectorDefinition): ConnectorDefinition {
  if (!(def.files || def.storage)) {
    return def;
  }
  return {
    ...def,
    actions: [
      ...def.actions,
      ...(def.files
        ? filesCapabilityActions(def.files, def.filesProviderScopes)
        : []),
      ...(def.storage
        ? storageCapabilityActions(def.storage, def.storageProviderScopes)
        : []),
    ],
  };
}

const accountParam = z
  .string()
  .optional()
  .describe(
    "Which connected account to use when several accounts of this service are connected (case-insensitive substring of the account email or display name). Omit when only one account is connected; discover accounts with connections_list_accounts."
  );

/**
 * Inject the optional `account` addressing param into a projected action's
 * input schema. Static tool descriptions cannot enumerate per-tenant accounts
 * (the operation catalog is process-global), so addressing rides on a generic
 * param plus the `connection_ambiguous` error path.
 */
export function withAccountParam(schema: ZodType): ZodType {
  if (schema instanceof z.ZodObject) {
    return schema.extend({ account: accountParam });
  }
  return schema.and(z.object({ account: accountParam }));
}

function buildActionOperation(params: {
  action: ConnectorAction;
  connector: ConnectorDefinition;
  supabase: SupabaseClient;
}): PluginServerOperation {
  const { action, connector, supabase } = params;
  const contract = ACTION_GROUP_CONTRACTS[action.group];
  const operationId = connectorOperationId(connector, action.id);
  const repo = createConnectionsRepo(supabase);

  return {
    description: `${action.description} (external connection: ${connector.name})`,
    handler: async (input, ctx) => {
      const auth = ctx.auth;
      if (!auth) {
        throw new Error("connection_auth_required");
      }
      let account: string | null = null;
      let actionInput = input;
      if (input && typeof input === "object" && !Array.isArray(input)) {
        const { account: raw, ...rest } = input as Record<string, unknown>;
        account = typeof raw === "string" ? raw : null;
        actionInput = rest;
      }
      // Defense in depth: the connections profile policy is the authoritative
      // gate (with full principal context); the executor re-checks with the
      // narrower gateway auth so a route that skipped policy still cannot
      // execute a denied action.
      const { output } = await executeConnectorAction({
        account,
        action,
        connector,
        input: actionInput,
        isAutonomous: false,
        log: (msg, data) => ctx.logger.info(msg, data ?? {}),
        principal: { principalId: auth.principalId, principalType: "user" },
        recordAuditEvent: (event) => ctx.recordAuditEvent?.(event),
        repo,
        tenantId: auth.tenantId,
      });
      return output;
    },
    idempotent: contract.idempotent,
    inputSchema: withAccountParam(action.inputSchema),
    moduleId: connector.moduleId,
    operationId,
    ...(action.outputSchema ? { outputSchema: action.outputSchema } : {}),
    requiredCapabilities: [
      `module.connections.${action.group === "read" ? "read" : "write"}`,
    ],
    requiresApproval: contract.requiresApproval,
    riskLevel: contract.riskLevel,
    summary: action.summary,
  };
}

/**
 * Register a connector inside a connector module's plugin factory: adds the
 * definition to the shared registry (OAuth routes + UI catalog) and registers
 * one module operation per action under the connector module's provenance.
 */
export function registerConnectorModule(
  engenty: EngentyPluginApi,
  def: ConnectorDefinition
): void {
  const supabaseRaw = engenty.server.getDatabaseAdapter?.() ?? null;
  if (!supabaseRaw) {
    throw new Error(
      `Connector module ${def.moduleId} requires a database adapter`
    );
  }
  const supabase = supabaseRaw as SupabaseClient;
  registerConnectorDefinition(def);
  for (const action of def.actions) {
    engenty.server.registerOperation(
      buildActionOperation({ action, connector: def, supabase })
    );
  }
}
