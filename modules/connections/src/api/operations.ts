import type { ConnectionsRepo } from "@engenty/connections-sdk";
import {
  ACTION_GROUP_DEFAULT_POLICY,
  connectionAccountLabel,
  connectorOperationId,
  executeConnectorAction,
  getConnectorDefinition,
  grantedOperationIds,
  hasOAuth2ClientCredentials,
  listConnectorDefinitions,
} from "@engenty/connections-sdk";
import type { PluginServerApi } from "@engenty/plugin-sdk";
import { z } from "zod";
import type { ConnectionsSettingsResolver } from "../lib/settings-resolver.js";

const connectionIdSchema = z.object({ connection_id: z.string().uuid() });

const groupSchema = z.enum(["read", "write", "destructive"]);
const policySchema = z.enum(["allow", "ask", "deny"]);

export interface ConnectionsOperationHooks {
  onApprovalDecided: (params: {
    approved: boolean;
    /** Connector operation id the approval was gating (grant currency). */
    operationId: string;
    requestId: string;
    /** Task blocked on this approval, when the ask came from a task run. */
    taskId: string | null;
    tenantId: string;
  }) => Promise<void>;
  settings: ConnectionsSettingsResolver;
}

export function registerConnectionsOperations(
  api: PluginServerApi,
  repo: ConnectionsRepo,
  hooks: ConnectionsOperationHooks
): void {
  // ── Catalog: connectors + this principal's connection state ──────────────
  api.registerOperation({
    operationId: "connections_catalog",
    moduleId: "connections",
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
      const { principalId, tenantId } = ctx.auth;
      const connectors = listConnectorDefinitions();
      const connections = await repo.listConnections({ tenantId });
      const visible = connections.filter(
        (c) => c.sharing === "org" || c.owner_user_id === principalId
      );
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
          configured: configuredByConnector.get(connector.id) ?? true,
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
      const connector = getConnectorDefinition(connector_id);
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
      const candidates = await repo.listCandidateConnections({
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
    summary:
      "List the connected accounts usable for a connector (for the `account` param of its actions)",
    description:
      "Accounts the caller can address on a connector's actions via the optional `account` input param, with their sharing mode. Use when an action fails with connection_ambiguous.",
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
      const candidates = await repo.listCandidateConnections({
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
      const connections = await repo.listConnections({ tenantId });
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
        if (
          !(
            connection.sharing === "org" ||
            connection.owner_user_id === principalId
          )
        ) {
          continue;
        }
        const def = getConnectorDefinition(connection.connector_id);
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
      const connection = await repo.getConnection({
        connectionId: parsed.connection_id,
        tenantId: ctx.auth.tenantId,
      });
      if (!connection) {
        throw new Error("connection_not_found");
      }
      const connector = getConnectorDefinition(connection.connector_id);
      const action = connector?.actions.find((a) => a.id === "files_write");
      if (!(connector && action)) {
        throw new Error("connection_not_storage_capable");
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
    summary: "Update sharing, autonomous mode, or display name of a connection",
    riskLevel: "medium",
    requiredCapabilities: ["module.connections.write"],
    inputSchema: connectionIdSchema.extend({
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
        autonomous_mode?: "off" | "read_only" | "full";
        display_name?: string | null;
        non_owner_max_group?: "read" | "write" | "destructive" | null;
        sharing?: "personal" | "org";
      };
      await assertOwnerOrThrow(repo, ctx.auth, parsed.connection_id);
      if (parsed.sharing === "org") {
        const connection = await repo.getConnection({
          connectionId: parsed.connection_id,
          tenantId: ctx.auth.tenantId,
        });
        const def = connection
          ? getConnectorDefinition(connection.connector_id)
          : undefined;
        if (def?.auth.kind === "browser") {
          throw new Error(
            "browser connectors are device-local and cannot be shared org-wide"
          );
        }
      }
      await repo.updateConnectionSettings({
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
      await assertOwnerOrThrow(repo, ctx.auth, parsed.connection_id);
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
    summary: "Disconnect and delete a connection (tokens are destroyed)",
    riskLevel: "high",
    requiredCapabilities: ["module.connections.write"],
    inputSchema: connectionIdSchema,
    handler: async (input, ctx) => {
      if (!ctx.auth) {
        throw new Error("unauthorized");
      }
      const parsed = input as { connection_id: string };
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
        requests: await repo.listApprovalRequests({
          status: parsed.status ?? "pending",
          tenantId: ctx.auth.tenantId,
        }),
      };
    },
  });

  api.registerOperation({
    operationId: "connections_approvals_decide",
    moduleId: "connections",
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
      const connections = await repo.listConnections({ tenantId });
      const usable = connections.filter(
        (c) =>
          c.status === "active" &&
          (c.sharing === "org" || c.owner_user_id === principalId)
      );
      const overrides = await repo.listPolicyOverrides(usable.map((c) => c.id));
      const granted = new Set<string>();
      for (const connection of usable) {
        const connector = getConnectorDefinition(connection.connector_id);
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
}

async function assertOwnerOrThrow(
  repo: ConnectionsRepo,
  auth: { principalId: string; tenantId: string },
  connectionId: string
): Promise<void> {
  const connection = await repo.getConnection({
    connectionId,
    tenantId: auth.tenantId,
  });
  if (!connection) {
    throw new Error("connection_not_found");
  }
  // Owners manage their connections. Org connections without an owner match
  // (e.g. the owner left) stay manageable via tenant admin capability, which
  // the operation-level requiredCapabilities already gate.
  if (
    connection.sharing === "personal" &&
    connection.owner_user_id !== auth.principalId
  ) {
    throw new Error("connection_not_owner");
  }
}
