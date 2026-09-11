import type {
  EngentyPluginApi,
  PluginServerOperation,
} from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type ZodType, z } from "zod";
import {
  connectorCapability,
  connectorCapabilityBase,
} from "./capabilities.js";
import { createConnectorClientEnv } from "./client-env-resolver.js";
import { executeConnectorAction } from "./execute.js";
import { filesCapabilityActions } from "./files-capability.js";
import type { ClientEnvResolver } from "./oauth2.js";
import { registerConnectorDefinition } from "./registry.js";
import { createConnectionsRepo } from "./repo.js";
import {
  listMountedConnectionAccess,
  resolveVerifiedSpaceOwnerForRun,
} from "./space-mounts.js";
import { storageCapabilityActions } from "./storage-capability.js";
import type { ConnectorAction, ConnectorDefinition } from "./types.js";
import { ACTION_GROUP_CONTRACTS, connectorOperationId } from "./types.js";

/**
 * Connector actions are account-scoped. The `account` input is a label, not a
 * connection UUID, so core cannot key the mount check off it — existing
 * execute-time candidate ∩ Space-mount intersection stays authoritative.
 */
export const CONNECTOR_ACTION_SPACE_POLICY = {
  kind: "account_mounted",
} as const;

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
  /** Tenant-locked handle factory (engenty_server lane, RLS-enforced). */
  getDb: (auth: { tenantId: string }) => SupabaseClient;
  clientEnv: (tenantId: string | null) => ClientEnvResolver;
}): PluginServerOperation {
  const { action, connector, getDb, clientEnv } = params;
  const contract = ACTION_GROUP_CONTRACTS[action.group];
  const operationId = connectorOperationId(connector, action.id);

  return {
    description: `${action.description} (external connection: ${connector.name})`,
    handler: async (input, ctx) => {
      const auth = ctx.auth;
      if (!auth) {
        throw new Error("connection_auth_required");
      }
      // Per-call repo on the caller's tenant handle — projected actions are
      // request-shaped, so the database itself confines every read/write.
      const repo = createConnectionsRepo(getDb(auth));
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
      // execute a denied action. The space mounts and the verified personal-
      // space owner are resolved here for the same parity: without them the
      // re-check would deny a §2.1 owner-reach call the policy allowed, and
      // would skip the space narrowing the policy applied.
      const spaceId = auth.spaceId?.trim();
      const mountedConnectionAccess = spaceId
        ? await listMountedConnectionAccess(getDb(auth), auth.tenantId, spaceId)
        : null;
      const spaceOwnerUserId = spaceId
        ? await resolveVerifiedSpaceOwnerForRun(getDb(auth), {
            principalType: auth.principalType ?? "user",
            spaceId,
            tenantId: auth.tenantId,
            triggerId: auth.triggerId ?? null,
          })
        : null;
      const { output } = await executeConnectorAction({
        account,
        action,
        // CN.5 — the agent driving this call, so a grant on someone's personal
        // account is honoured here exactly as the profile policy honours it.
        ...(auth.agentId ? { agentId: auth.agentId } : {}),
        connector,
        input: actionInput,
        isAutonomous: false,
        log: (msg, data) => ctx.logger.info(msg, data ?? {}),
        ...(mountedConnectionAccess ? { mountedConnectionAccess } : {}),
        ...(spaceOwnerUserId ? { spaceOwnerUserId } : {}),
        principal: {
          // Carried so the executor can re-check the per-connector scope
          // (CON-02) rather than trusting that policy already ran.
          capabilities: auth.capabilities,
          principalId: auth.principalId,
          principalType: "user",
        },
        recordAuditEvent: (event) => ctx.recordAuditEvent?.(event),
        repo,
        resolveEnv: clientEnv(auth.tenantId),
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
    spacePolicy: CONNECTOR_ACTION_SPACE_POLICY,
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
  // Phase A seam (PLAN-tenant-isolation-a-rls-seam.md): request-shaped work runs on
  // tenant-locked handles (engenty_server lane, RLS-enforced) — every projected
  // action handler resolves getDb(auth) per call. The service client remains ONLY
  // for the OAuth client-credential resolver: platform-level settings rows carry
  // tenant_id NULL, which the tenant lane cannot see by design (platform settings
  // are core service-lane work; the resolver is tenant-parameterized per lookup).
  const serviceDb = (engenty.server.getServiceDb?.() ??
    null) as SupabaseClient | null;
  const getTenantDb = engenty.server.getTenantDb;
  if (!(serviceDb && getTenantDb)) {
    throw new Error(
      `Connector module ${def.moduleId} requires a database adapter and tenant-locked handles (server.getTenantDb)`
    );
  }
  const getDb = (auth: { tenantId: string }) =>
    getTenantDb(auth) as SupabaseClient;
  const clientEnv = createConnectorClientEnv(serviceDb);
  registerConnectorDefinition(def);
  for (const action of def.actions) {
    engenty.server.registerOperation(
      buildActionOperation({ action, connector: def, getDb, clientEnv })
    );
  }
  registerConnectorRoleProfiles(engenty, def);
}

/**
 * Assignable bundles that scope a principal to THIS connector (CON-02).
 *
 * Each carries the broad `module.connections.<group>` — core's operation gate
 * checks that, so it is the entry ticket — plus the per-connector capability
 * that narrows where the ticket may be spent. Registered from here, not from
 * the connections module, because only the connector module knows its own id,
 * and plugin load order between them is not guaranteed.
 *
 * `connections.editor` (all connectors) stays exactly as it was, so nothing
 * that already works changes.
 */
function registerConnectorRoleProfiles(
  engenty: EngentyPluginApi,
  def: ConnectorDefinition
): void {
  const hasWrite = def.actions.some((action) => action.group !== "read");
  engenty.server.registerRoleProfiles?.([
    {
      capabilities: [
        connectorCapabilityBase("read"),
        connectorCapability("read", def.id),
      ],
      description: `Read-only access to ${def.name} and no other connector.`,
      id: `connections.viewer.${def.id}`,
      title: `Connections viewer — ${def.name}`,
    },
    ...(hasWrite
      ? [
          {
            capabilities: [
              connectorCapabilityBase("read"),
              connectorCapability("read", def.id),
              connectorCapabilityBase("write"),
              connectorCapability("write", def.id),
            ],
            description: `Read and write access to ${def.name} and no other connector.`,
            id: `connections.editor.${def.id}`,
            title: `Connections editor — ${def.name}`,
          },
        ]
      : []),
  ]);
}
