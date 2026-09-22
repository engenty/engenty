import type { ConnectionsRepo } from "@engenty/connections-sdk";
import {
  ACTION_GROUP_DEFAULT_POLICY,
  connectionAccountLabel,
  connectionVisibleToUser,
  connectorOperationId,
  executeConnectorAction,
  getConnectorDefinition,
  grantedOperationIds,
  hasOAuth2ClientCredentials,
  listConnectorDefinitions,
} from "@engenty/connections-sdk";
import type { PluginServerApi } from "@engenty/plugin-sdk";
import {
  capabilityCovers,
  forbiddenError,
  notFoundError,
  PluginOperationError,
} from "@engenty/plugin-sdk";
import { z } from "zod";
import type { ConnectionsSettingsResolver } from "../lib/settings-resolver.js";

const connectionIdSchema = z.object({ connection_id: z.string().uuid() });

const groupSchema = z.enum(["read", "write", "destructive"]);
const policySchema = z.enum(["allow", "ask", "deny"]);

/** Catalog/list ops: availability is the Space mount; no connection id on input. */
const ACCOUNT_MOUNTED = { kind: "account_mounted" } as const;
/** Ops that name a connection UUID — refuse accounts not mounted here. */
const ACCOUNT_MOUNTED_CONNECTION = {
  connectionInputKey: "connection_id",
  kind: "account_mounted",
} as const;

export interface ConnectionsOperationHooks {
  /**
   * Grant this account to the Space the caller is standing in (CN.4).
   *
   * Owner settings (autonomous mode, tool policies) are tenant-level, but
   * saving them from a Space should also make the account usable HERE —
   * otherwise "Allow read-only" succeeds in the form and still fails for
   * every agent call.
   */
  mountConnectionInSpace?: (params: {
    connectionId: string;
    spaceId: string;
    tenantId: string;
  }) => Promise<void>;
  onApprovalDecided: (params: {
    approved: boolean;
    /** Connector operation id the approval was gating (grant currency). */
    operationId: string;
    requestId: string;
    /** Task blocked on this approval, when the ask came from a task run. */
    taskId: string | null;
    tenantId: string;
  }) => Promise<void>;
  /**
   * Agent key (`contacts.inbox-importer`) → the core.agents principal uuid the
   * grant table keys on. An agent only ever knows its own key — the uuid is
   * not on any surface it can read — so demanding one made this operation
   * uncallable from chat.
   */
  resolveAgentPrincipalId?: (input: {
    agentKey: string;
    tenantId: string;
  }) => Promise<string | null>;
  settings: ConnectionsSettingsResolver;
}

const UUID =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Accepts either identifier and answers the uuid the grant row needs. */
async function toAgentPrincipalId(
  hooks: ConnectionsOperationHooks,
  tenantId: string,
  agentId: string
): Promise<string> {
  if (UUID.test(agentId)) {
    return agentId;
  }
  const resolved = await hooks.resolveAgentPrincipalId?.({
    agentKey: agentId,
    tenantId,
  });
  if (!resolved) {
    throw notFoundError(
      "agent_not_found",
      `unknown agent "${agentId}" — pass the agent id from registry_agents_list`
    );
  }
  return resolved;
}

async function grantToActiveSpace(
  hooks: ConnectionsOperationHooks,
  auth: { spaceId?: string; tenantId: string },
  connectionId: string
): Promise<void> {
  const spaceId = auth.spaceId?.trim();
  if (!(spaceId && hooks.mountConnectionInSpace)) {
    return;
  }
  await hooks.mountConnectionInSpace({
    connectionId,
    spaceId,
    tenantId: auth.tenantId,
  });
}

export function registerConnectionsOperations(
  api: PluginServerApi,
  /** Tenant-locked repo factory (Phase A) — every handler carries `ctx.auth`. */
  getRepo: (auth: { tenantId: string }) => ConnectionsRepo,
  hooks: ConnectionsOperationHooks
): void {
  // ── Catalog: connectors + this principal's connection state ──────────────
  api.registerOperation({
    operationId: "connections_catalog",
    moduleId: "connections",
    spacePolicy: ACCOUNT_MOUNTED,
    summary: "List available connectors and the caller's connection status",
    description:
      "Connector catalog with per-action permission matrix and connection state for the calling user.",
    idempotent: true,
    riskLevel: "low",
    requiredCapabilities: ["module.connections.read"],
    inputSchema: z.object({}).optional(),
    handler: async (_input, ctx) => {
      if (!ctx.auth) {
        throw new Error("unauthorized");
      }
      const { tenantId } = ctx.auth;
      const repo = getRepo(ctx.auth);
      const connectors = listConnectorDefinitions(tenantId);
      const connections = await repo.listConnections({ tenantId });
      const visible = connections;
      const overrides = await repo.listPolicyOverrides(
        visible.map((c) => c.id)
      );
      // "configured" = the connector can actually start a connect flow. OAuth
      // connectors need client credentials (env, platform, or this tenant's
      // override); api_key/browser connectors are always ready (the user
      // supplies credentials, or none are needed).
      const clientEnv = hooks.settings.clientEnv(tenantId);
      const configuredByConnector = new Map<string, boolean>();
      await Promise.all(
        connectors.map(async (connector) => {
          const configured =
            connector.auth.kind === "oauth2"
              ? await hasOAuth2ClientCredentials(
                  connector.auth.oauth2,
                  clientEnv
                )
              : true;
          configuredByConnector.set(connector.id, configured);
        })
      );
      return {
        connectors: connectors.map((connector) => ({
          // What this connector can BE to a module — the words a module
          // manifest declares its need in (PLAN-connections-ux.md B3).
          // `stream` has no actions of its own, so it is invisible without
          // this: nothing downstream could tell a mailbox from a drive.
          capabilities: {
            files: Boolean(connector.files),
            storage: Boolean(connector.storage),
            stream: Boolean(connector.stream),
          },
          configured: configuredByConnector.get(connector.id) ?? true,
          dcr_available:
            connector.auth.kind === "oauth2" &&
            Boolean(connector.auth.oauth2.dynamicClientRegistration),
          actions: connector.actions.map((action) => ({
            default_policy: ACTION_GROUP_DEFAULT_POLICY[action.group],
            description: action.description,
            group: action.group,
            id: action.id,
            operation_id: connectorOperationId(connector, action.id),
            summary: action.summary,
          })),
          connections: visible
            .filter((c) => c.connector_id === connector.id)
            .map((connection) => ({
              ...connection,
              policies: overrides.filter(
                (o) => o.connection_id === connection.id
              ),
            })),
          auth_kind: connector.auth.kind,
          // Credential form fields for api_key connectors (labels only — never
          // any submitted secret value).
          credential_fields:
            connector.auth.kind === "api_key"
              ? connector.auth.apiKey.fields.map((field) => ({
                  key: field.key,
                  label: field.label,
                  placeholder: field.placeholder ?? null,
                  required: field.required ?? true,
                  secret: field.secret ?? false,
                }))
              : null,
          description: connector.description,
          icon: connector.icon ?? null,
          id: connector.id,
          module_id: connector.moduleId,
          name: connector.name,
          tool_prefix: connector.toolPrefix,
        })),
      };
    },
  });

  // ── Guided connect (connection agent) ────────────────────────────────────
  // Lets an agent offer the user a one-click connect card in chat. Read-only:
  // returns whether the connector is configured (client credentials present) and
  // already connected, so the agent can either render the connect card, tell the
  // user it's already connected, or (when unconfigured) point an admin at Setup.
  api.registerOperation({
    operationId: "connections_request_connect",
    moduleId: "connections",
    spacePolicy: ACCOUNT_MOUNTED,
    summary:
      "Check a connector's connect state and offer the user a connect card",
    description:
      "Use when the user needs to connect an integration (e.g. their email or calendar) before you can act. Returns the connector's connect state: `configured` (client credentials exist so a connect flow can start), `connected` (the caller already has a usable connection), the connected `accounts`, and `auth_kind`. When configured and not connected, a connect button is shown to the user in chat. When not configured, tell the user an admin must add the connector's credentials in Setup → Platform settings.",
    idempotent: true,
    riskLevel: "low",
    requiredCapabilities: ["module.connections.read"],
    inputSchema: z.object({
      connector_id: z.string().describe('Connector id (e.g. "google-gmail").'),
    }),
    handler: async (input, ctx) => {
      if (!ctx.auth) {
        throw new Error("unauthorized");
      }
      const { connector_id } = input as { connector_id: string };
      const connector = getConnectorDefinition(connector_id, ctx.auth.tenantId);
      if (!connector) {
        throw new Error(`Unknown connector: ${connector_id}`);
      }
      const configured =
        connector.auth.kind === "oauth2"
          ? await hasOAuth2ClientCredentials(
              connector.auth.oauth2,
              hooks.settings.clientEnv(ctx.auth.tenantId)
            )
          : true;
      const dcrAvailable =
        connector.auth.kind === "oauth2" &&
        Boolean(connector.auth.oauth2.dynamicClientRegistration);
      const candidates = await getRepo(ctx.auth).listCandidateConnections({
        connectorId: connector_id,
        principalId: ctx.auth.principalId,
        tenantId: ctx.auth.tenantId,
      });
      return {
        connector: {
          id: connector.id,
          name: connector.name,
          icon: connector.icon ?? null,
          auth_kind: connector.auth.kind,
        },
        configured,
        connected: candidates.length > 0,
        dcr_available: dcrAvailable,
        accounts: candidates.map(connectionAccountLabel),
      };
    },
  });

  // ── Account discovery for agents ──────────────────────────────────────────
  // Static tool descriptions cannot enumerate per-tenant accounts (the
  // operation catalog is process-global); this cheap read plus the
  // connection_ambiguous error path carry that job.
  api.registerOperation({
    operationId: "connections_list_accounts",
    moduleId: "connections",
    spacePolicy: ACCOUNT_MOUNTED,
    summary:
      "List the connected accounts usable for a connector (for the `account` param of its actions)",
    description:
      "Accounts the caller can address on a connector's actions via the optional `account` input param. Use when an action fails with connection_ambiguous.",
    idempotent: true,
    riskLevel: "low",
    requiredCapabilities: ["module.connections.read"],
    inputSchema: z.object({
      connector_id: z.string().describe('Connector id (e.g. "google-gmail").'),
    }),
    handler: async (input, ctx) => {
      if (!ctx.auth) {
        throw new Error("unauthorized");
      }
      const parsed = input as { connector_id: string };
      const candidates = await getRepo(ctx.auth).listCandidateConnections({
        connectorId: parsed.connector_id,
        principalId: ctx.auth.principalId,
        tenantId: ctx.auth.tenantId,
      });
      return { accounts: candidates.map(connectionAccountLabel) };
    },
  });

  // ── Storage targets for artifact/project storage pickers ─────────────────
  api.registerOperation({
    operationId: "connections_storage_targets",
    moduleId: "connections",
    spacePolicy: ACCOUNT_MOUNTED,
    summary: "List connections that can store files (write capability)",
    description:
      "Active, caller-visible connections whose connector declares the storage (write) capability. Used to pick where project artifacts are mirrored.",
    idempotent: true,
    riskLevel: "low",
    requiredCapabilities: ["module.connections.read"],
    inputSchema: z.object({}).optional(),
    handler: async (_input, ctx) => {
      if (!ctx.auth) {
        throw new Error("unauthorized");
      }
      const { principalId, tenantId } = ctx.auth;
      const connections = await getRepo(ctx.auth).listConnections({ tenantId });
      const targets: {
        connection_id: string;
        connector_icon: string | null;
        connector_id: string;
        connector_name: string;
        label: string;
      }[] = [];
      for (const connection of connections) {
        if (connection.status !== "active") {
          continue;
        }
        if (!connectionVisibleToUser(connection, principalId)) {
          continue;
        }
        const def = getConnectorDefinition(connection.connector_id, tenantId);
        if (!def?.storage) {
          continue;
        }
        targets.push({
          connection_id: connection.id,
          connector_icon: def.icon ?? null,
          connector_id: def.id,
          connector_name: def.name,
          label:
            connection.display_name ?? connection.external_account ?? def.name,
        });
      }
      return { targets };
    },
  });

  // ── Connection-addressed file write (artifact mirroring) ─────────────────
  // Unlike the per-connector `<prefix>_files_write` projections (which resolve
  // the connection by account label), this targets an explicit connection id —
  // the shape stored in artifact storage bindings. The connector's action
  // policy still gates the write inside executeConnectorAction.
  api.registerOperation({
    operationId: "connections_files_write",
    moduleId: "connections",
    spacePolicy: ACCOUNT_MOUNTED_CONNECTION,
    summary: "Write a file to a specific storage-capable connection",
    description:
      "Write (create or overwrite) a file on the storage of one connection, addressed by connection id. Used to mirror promoted artifacts to configured project storage.",
    idempotent: false,
    riskLevel: "medium",
    requiredCapabilities: ["module.connections.write"],
    inputSchema: z.object({
      connection_id: z.string().uuid(),
      content_base64: z.string().optional(),
      content_text: z.string().optional(),
      folder_ref: z.string().nullish(),
      mime_type: z.string().nullish(),
      name: z.string().min(1).max(512),
    }),
    handler: async (input, ctx) => {
      if (!ctx.auth) {
        throw new Error("unauthorized");
      }
      const parsed = input as {
        connection_id: string;
        content_base64?: string;
        content_text?: string;
        folder_ref?: string | null;
        mime_type?: string | null;
        name: string;
      };
      const repo = getRepo(ctx.auth);
      const connection = await repo.getConnection({
        connectionId: parsed.connection_id,
        tenantId: ctx.auth.tenantId,
      });
      if (!connection) {
        throw notFoundError(
          "connection_not_found",
          "No such connection in this tenant."
        );
      }
      const connector = getConnectorDefinition(
        connection.connector_id,
        ctx.auth.tenantId
      );
      const action = connector?.actions.find((a) => a.id === "files_write");
      if (!(connector && action)) {
        // 400: the connection is real, the request asks it for something it
        // cannot do. Nothing is broken server-side.
        throw new PluginOperationError(
          "connection_not_storage_capable",
          "This connection cannot store files."
        );
      }
      const { output } = await executeConnectorAction({
        action,
        connectionId: parsed.connection_id,
        connector,
        input: {
          content_base64: parsed.content_base64,
          content_text: parsed.content_text,
          folder_ref: parsed.folder_ref ?? null,
          mime_type: parsed.mime_type ?? null,
          name: parsed.name,
        },
        isAutonomous: false,
        principal: {
          principalId: ctx.auth.principalId,
          principalType: "user",
        },
        recordAuditEvent: (event) => ctx.recordAuditEvent?.(event),
        repo,
        tenantId: ctx.auth.tenantId,
      });
      return output;
    },
  });

  // ── Connection settings ───────────────────────────────────────────────────
  api.registerOperation({
    operationId: "connections_update_settings",
    moduleId: "connections",
    // Owner configuration of the ACCOUNT, not a use of it in the Space.
    // Requiring a mount here blocked "Allow read-only" for a folder that was
    // already connected from Files. Granting to the active Space happens in
    // the handler so agents can then use it.
    spacePolicy: ACCOUNT_MOUNTED,
    summary:
      "Update all-spaces, autonomous mode, or display name of a connection",
    riskLevel: "medium",
    requiredCapabilities: ["module.connections.write"],
    inputSchema: connectionIdSchema.extend({
      all_spaces: z.boolean().optional(),
      autonomous_mode: z.enum(["off", "read_only", "full"]).optional(),
      display_name: z.string().max(200).nullable().optional(),
      non_owner_max_group: groupSchema.nullable().optional(),
      sharing: z.enum(["personal", "org"]).optional(),
    }),
    handler: async (input, ctx) => {
      if (!ctx.auth) {
        throw new Error("unauthorized");
      }
      const parsed = input as z.infer<typeof connectionIdSchema> & {
        all_spaces?: boolean;
        autonomous_mode?: "off" | "read_only" | "full";
        display_name?: string | null;
        non_owner_max_group?: "read" | "write" | "destructive" | null;
        sharing?: "personal" | "org";
      };
      const repo = getRepo(ctx.auth);
      await assertOwnerOrThrow(repo, ctx.auth, parsed.connection_id);
      await grantToActiveSpace(hooks, ctx.auth, parsed.connection_id);
      if (parsed.all_spaces) {
        const connection = await repo.getConnection({
          connectionId: parsed.connection_id,
          tenantId: ctx.auth.tenantId,
        });
        const def = connection
          ? getConnectorDefinition(connection.connector_id, ctx.auth.tenantId)
          : undefined;
        if (def?.auth.kind === "browser") {
          throw new Error(
            "browser connectors are device-local and cannot be shared with every space"
          );
        }
      }
      await repo.updateConnectionSettings({
        allSpaces: parsed.all_spaces,
        autonomousMode: parsed.autonomous_mode,
        connectionId: parsed.connection_id,
        displayName: parsed.display_name,
        nonOwnerMaxGroup: parsed.non_owner_max_group,
        sharing: parsed.sharing,
        tenantId: ctx.auth.tenantId,
      });
      ctx.recordAuditEvent?.({
        detail: { connection_id: parsed.connection_id },
        type: "connection.settings_updated",
      });
      return { ok: true };
    },
  });

  api.registerOperation({
    operationId: "connections_set_policy",
    moduleId: "connections",
    spacePolicy: ACCOUNT_MOUNTED,
    summary: "Set or clear an allow/ask/deny policy for an action or group",
    riskLevel: "medium",
    requiredCapabilities: ["module.connections.write"],
    inputSchema: connectionIdSchema.extend({
      policy: policySchema.nullable(),
      selector: z.string().min(1).max(120),
    }),
    handler: async (input, ctx) => {
      if (!ctx.auth) {
        throw new Error("unauthorized");
      }
      const parsed = input as {
        connection_id: string;
        policy: "allow" | "ask" | "deny" | null;
        selector: string;
      };
      const repo = getRepo(ctx.auth);
      await assertOwnerOrThrow(repo, ctx.auth, parsed.connection_id);
      await grantToActiveSpace(hooks, ctx.auth, parsed.connection_id);
      await repo.setPolicyOverride({
        connectionId: parsed.connection_id,
        policy: parsed.policy,
        selector: parsed.selector,
      });
      ctx.recordAuditEvent?.({
        detail: {
          connection_id: parsed.connection_id,
          policy: parsed.policy,
          selector: parsed.selector,
        },
        type: "connection.policy_updated",
      });
      return { ok: true };
    },
  });

  api.registerOperation({
    operationId: "connections_disconnect",
    moduleId: "connections",
    spacePolicy: ACCOUNT_MOUNTED_CONNECTION,
    summary: "Disconnect and delete a connection (tokens are destroyed)",
    riskLevel: "high",
    requiredCapabilities: ["module.connections.write"],
    inputSchema: connectionIdSchema,
    handler: async (input, ctx) => {
      if (!ctx.auth) {
        throw new Error("unauthorized");
      }
      const parsed = input as { connection_id: string };
      const repo = getRepo(ctx.auth);
      await assertOwnerOrThrow(repo, ctx.auth, parsed.connection_id);
      await repo.deleteConnection({
        connectionId: parsed.connection_id,
        tenantId: ctx.auth.tenantId,
      });
      ctx.recordAuditEvent?.({
        detail: { connection_id: parsed.connection_id },
        type: "connection.disconnected",
      });
      return { ok: true };
    },
  });

  // ── Approvals ─────────────────────────────────────────────────────────────
  api.registerOperation({
    operationId: "connections_approvals_list",
    moduleId: "connections",
    spacePolicy: ACCOUNT_MOUNTED,
    summary: "List pending connection approval requests for this tenant",
    idempotent: true,
    riskLevel: "low",
    requiredCapabilities: ["module.connections.read"],
    inputSchema: z.object({
      status: z.enum(["pending", "approved", "denied", "expired"]).optional(),
    }),
    handler: async (input, ctx) => {
      if (!ctx.auth) {
        throw new Error("unauthorized");
      }
      const parsed = input as {
        status?: "pending" | "approved" | "denied" | "expired";
      };
      return {
        requests: await getRepo(ctx.auth).listApprovalRequests({
          status: parsed.status ?? "pending",
          tenantId: ctx.auth.tenantId,
        }),
      };
    },
  });

  api.registerOperation({
    operationId: "connections_approvals_decide",
    moduleId: "connections",
    spacePolicy: ACCOUNT_MOUNTED,
    summary: "Approve or deny a pending connection approval request",
    riskLevel: "high",
    requiredCapabilities: ["module.connections.write"],
    inputSchema: z.object({
      approved: z.boolean(),
      /** Also persist an allow policy so retries pass without re-asking. */
      grant_always: z.boolean().optional(),
      request_id: z.string().uuid(),
    }),
    handler: async (input, ctx) => {
      if (!ctx.auth) {
        throw new Error("unauthorized");
      }
      const parsed = input as {
        approved: boolean;
        grant_always?: boolean;
        request_id: string;
      };
      const repo = getRepo(ctx.auth);
      // Owner check BEFORE deciding. It used to run after: a non-owner's
      // decide flipped the row to decided, then threw — burning the request
      // so the actual owner found nothing left to approve.
      const pendingRequest = await repo.getApprovalRequest(parsed.request_id);
      if (
        !pendingRequest ||
        pendingRequest.tenant_id !== ctx.auth.tenantId ||
        pendingRequest.status !== "pending"
      ) {
        throw new Error("approval_request_not_pending");
      }
      await assertOwnerOrThrow(repo, ctx.auth, pendingRequest.connection_id);
      // Approving mints a one-shot core grant for the requesting principal
      // (inside decideApprovalRequest) — that grant is what the retried run
      // spends to get past the gate.
      const decided = await repo.decideApprovalRequest({
        decidedBy: ctx.auth.principalId,
        id: parsed.request_id,
        status: parsed.approved ? "approved" : "denied",
        tenantId: ctx.auth.tenantId,
      });
      if (!decided) {
        throw new Error("approval_request_not_pending");
      }
      if (parsed.approved && parsed.grant_always) {
        await repo.setPolicyOverride({
          connectionId: decided.connection_id,
          policy: "allow",
          selector: decided.action_id,
        });
      }
      await hooks.onApprovalDecided({
        approved: parsed.approved,
        operationId: decided.operation_id,
        requestId: decided.id,
        taskId: decided.task_id,
        tenantId: ctx.auth.tenantId,
      });
      ctx.recordAuditEvent?.({
        detail: {
          approved: parsed.approved,
          connection_id: decided.connection_id,
          request_id: decided.id,
        },
        type: "connection.approval_decided",
      });
      return { ok: true, request: decided };
    },
  });

  // ── Run-start grants for the AI pre-gate ──────────────────────────────────
  api.registerOperation({
    operationId: "connections_granted_operations",
    moduleId: "connections",
    spacePolicy: ACCOUNT_MOUNTED,
    summary:
      "Operation ids the caller has durably allowed on their connections (merged into chat approval grants)",
    idempotent: true,
    riskLevel: "low",
    requiredCapabilities: ["module.connections.read"],
    inputSchema: z.object({}).optional(),
    handler: async (_input, ctx) => {
      if (!ctx.auth) {
        throw new Error("unauthorized");
      }
      const { principalId, tenantId } = ctx.auth;
      const repo = getRepo(ctx.auth);
      const connections = await repo.listConnections({ tenantId });
      const usable = connections.filter(
        (c) => c.status === "active" && connectionVisibleToUser(c, principalId)
      );
      const overrides = await repo.listPolicyOverrides(usable.map((c) => c.id));
      const granted = new Set<string>();
      for (const connection of usable) {
        const connector = getConnectorDefinition(
          connection.connector_id,
          tenantId
        );
        if (!connector) {
          continue;
        }
        for (const id of grantedOperationIds({
          actions: connector.actions,
          connection,
          isAutonomous: false,
          overrides: overrides.filter((o) => o.connection_id === connection.id),
          principal: { principalId, principalType: "user" },
          toolPrefix: connector.toolPrefix,
        })) {
          granted.add(id);
        }
      }
      return { operation_ids: [...granted] };
    },
  });

  // ── Agent access (PLAN-spaces.md CN.5) ────────────────────────────────────
  // Managed from the AGENT's side in the UI — "which accounts may the
  // Marketing Agent use" — because that is how a person holds the question.
  // The operations are connection-shaped anyway: a grant is the owner lending
  // out their account, so the owner is who may write it.

  api.registerOperation({
    operationId: "connections_agent_grants_list",
    moduleId: "connections",
    spacePolicy: ACCOUNT_MOUNTED,
    summary: "Agent access grants on the caller's visible connections",
    description:
      "Which agents may use which connected accounts for background work.",
    idempotent: true,
    riskLevel: "low",
    requiredCapabilities: ["module.connections.read"],
    inputSchema: z
      .object({ agent_id: z.string().min(1).optional() })
      .optional(),
    handler: async (input, ctx) => {
      if (!ctx.auth) {
        throw new Error("unauthorized");
      }
      const { principalId, tenantId } = ctx.auth;
      const repo = getRepo(ctx.auth);
      const parsed = z
        .object({ agent_id: z.string().min(1).optional() })
        .optional()
        .parse(input);
      // Same either-identifier rule as the grant itself, so a filter written
      // with the key an agent knows does not silently match nothing.
      const filterAgentId = parsed?.agent_id
        ? await toAgentPrincipalId(hooks, tenantId, parsed.agent_id)
        : null;
      const connections = await repo.listConnections({ tenantId });
      // Grants are only reported for accounts the caller can already see, so
      // this cannot become a way to enumerate a colleague's mailboxes.
      const visible = new Map(
        connections
          .filter((c) => connectionVisibleToUser(c, principalId))
          .map((c) => [c.id, c])
      );
      const grants = (await repo.listAgentGrants()).filter((grant) =>
        visible.has(grant.connection_id)
      );
      const scoped = filterAgentId
        ? grants.filter((grant) => grant.agent_id === filterAgentId)
        : grants;
      return {
        grants: scoped.map((grant) => {
          const connection = visible.get(grant.connection_id);
          return {
            agent_id: grant.agent_id,
            connection_id: grant.connection_id,
            connector_id: connection?.connector_id ?? null,
            created_at: grant.created_at,
            display_name: connection?.display_name ?? null,
            external_account: connection?.external_account ?? null,
            all_spaces: connection?.all_spaces ?? false,
            sharing: connection?.sharing ?? null,
          };
        }),
      };
    },
  });

  api.registerOperation({
    operationId: "connections_agent_grant_set",
    moduleId: "connections",
    spacePolicy: ACCOUNT_MOUNTED_CONNECTION,
    summary: "Let an agent use a connected account, or take it back",
    description:
      "Owner-only. Granting is a deliberate sharing act: the agent may then act on this account in unattended runs, subject to the same autonomous-mode and per-action policies as anyone else.",
    idempotent: true,
    // Not "low": this hands an unattended runner access to a mailbox. The
    // level is what decides whether the action itself needs approving.
    riskLevel: "high",
    requiredCapabilities: ["module.connections.write"],
    inputSchema: z.object({
      // Either the agent's key or its principal uuid; the key is what an agent
      // can actually see, so it is the one that matters in practice.
      agent_id: z.string().min(1),
      connection_id: z.string().uuid(),
      granted: z.boolean(),
    }),
    handler: async (input, ctx) => {
      if (!ctx.auth) {
        throw new Error("unauthorized");
      }
      const parsed = z
        .object({
          agent_id: z.string().min(1),
          connection_id: z.string().uuid(),
          granted: z.boolean(),
        })
        .parse(input);
      const agentPrincipalId = await toAgentPrincipalId(
        hooks,
        ctx.auth.tenantId,
        parsed.agent_id
      );
      const repo = getRepo(ctx.auth);
      await assertOwnerOrThrow(repo, ctx.auth, parsed.connection_id);
      if (parsed.granted) {
        await repo.grantConnectionToAgent({
          agentId: agentPrincipalId,
          connectionId: parsed.connection_id,
          grantedBy: ctx.auth.principalId,
        });
      } else {
        await repo.revokeConnectionFromAgent({
          agentId: agentPrincipalId,
          connectionId: parsed.connection_id,
        });
      }
      ctx.recordAuditEvent?.({
        detail: {
          agent_id: parsed.agent_id,
          connection_id: parsed.connection_id,
          granted: parsed.granted,
        },
        type: parsed.granted
          ? "connection.agent_granted"
          : "connection.agent_revoked",
      });
      return { granted: parsed.granted };
    },
  });
}

async function assertOwnerOrThrow(
  repo: ConnectionsRepo,
  auth: { capabilities?: string[]; principalId: string; tenantId: string },
  connectionId: string
): Promise<void> {
  const connection = await repo.getConnection({
    connectionId,
    tenantId: auth.tenantId,
  });
  if (!connection) {
    // 404, not 500: the id names nothing in this tenant, which is something
    // the caller did — and the same answer a connection they may not see gets,
    // deliberately, so this cannot be used to probe for other people's rows.
    throw notFoundError(
      "connection_not_found",
      "No such connection in this tenant."
    );
  }
  if (connection.owner_user_id === auth.principalId) {
    return;
  }
  if (!connection.all_spaces) {
    throw forbiddenError(
      "connection_not_owner",
      "Only the connection's owner can change this."
    );
  }
  // All-spaces accounts: owner or tenant admin. Not every member — `module.*`
  // is in the member profile, so this separates them. An owner-less account
  // (the owner left) stays manageable by admins.
  if (!capabilityCovers([...(auth.capabilities ?? [])], "core.users.manage")) {
    throw forbiddenError(
      "connection_not_owner",
      "Only the connection's owner or a tenant admin can change this."
    );
  }
}
