import type {
  ConnectionReach,
  ConnectionSummary,
  ConnectionsRepo,
} from "@engenty/connections-sdk";
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
import type { PluginAuthContext, PluginServerApi } from "@engenty/plugin-sdk";
import {
  forbiddenError,
  notFoundError,
  PluginOperationError,
} from "@engenty/plugin-sdk";
import { z } from "zod";
import type { ConnectionsSettingsResolver } from "../lib/settings-resolver.js";
import {
  canManageSpace,
  isTenantAdmin,
  mayEnterSpace,
  type ResolveSpaceAccess,
} from "../lib/space-access.js";

const connectionIdSchema = z.object({ connection_id: z.string().uuid() });

const policySchema = z.enum(["allow", "ask", "deny"]);

/** Catalog/list ops: scoped to the caller's Space; no connection id on input. */
const ACCOUNT_MOUNTED = { kind: "account_mounted" } as const;
/** Ops that name a connection UUID — refuse accounts another Space owns. */
const ACCOUNT_MOUNTED_CONNECTION = {
  connectionInputKey: "connection_id",
  kind: "account_mounted",
} as const;

export interface ConnectionsOperationHooks {
  /**
   * A member asks the Organisation's admins to add a connector's OAuth
   * client: one notification per admin. Resolves how many were notified.
   */
  askAdminsForSetup: (params: {
    connector: { id: string; name: string };
    requesterId: string;
    tenantId: string;
  }) => Promise<number>;
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
   * The person whose own accounts this call may use — the caller live, or
   * their Copilot; null for engenties, services and Apps
   * (`resolvePersonalReach`).
   */
  resolvePersonalReach: (auth: OperationAuth) => Promise<string | null>;
  /** The Spaces a user may enter, and which of them they own. */
  resolveSpaceAccess: ResolveSpaceAccess;
  settings: ConnectionsSettingsResolver;
}

type OperationAuth = Pick<
  PluginAuthContext,
  | "agentId"
  | "callOrigin"
  | "capabilities"
  | "principalId"
  | "principalType"
  | "spaceId"
  | "tenantId"
>;

const spaceIdInput = z
  .string()
  .uuid()
  .optional()
  .describe("The Space whose accounts to use. Defaults to the current Space.");

const PERSONAL_OWNER_NOTE =
  "`me` is the person's own account (their mail, their calendar): only they and their Copilot use it, in any space, and nothing is synced from it. `space` is shared by the current space's members and engenties.";

function isUser(auth: OperationAuth): boolean {
  return (auth.principalType ?? "user") === "user";
}

/**
 * The Space a call acts in: `space_id` from the input, else the run's Space.
 * Required — every account belongs to one. A person may name any Space they
 * can enter; an unattended caller only the Space core resolved for its run.
 */
async function resolveCallerSpace(
  hooks: ConnectionsOperationHooks,
  auth: OperationAuth,
  inputSpaceId: string | undefined
): Promise<string> {
  const runSpaceId = auth.spaceId?.trim() || undefined;
  const spaceId = inputSpaceId?.trim() || runSpaceId;
  if (!spaceId) {
    throw new PluginOperationError(
      "connections.spaceRequired",
      "Connected accounts belong to a space; name one with space_id."
    );
  }
  if (!isUser(auth)) {
    if (spaceId !== runSpaceId) {
      throw forbiddenError(
        "connection_not_in_space",
        "An agent uses the accounts of the space it runs in, and no other."
      );
    }
    return spaceId;
  }
  if (!(await mayEnterSpace(hooks.resolveSpaceAccess, auth, spaceId))) {
    // 404 like core's space routes: "not yours" and "does not exist" look
    // the same, so this cannot confirm someone's private space.
    throw notFoundError("space_not_found", "No such space.");
  }
  return spaceId;
}

/**
 * Whose accounts a call reaches: its Space when it names or runs in one
 * (verified like {@link resolveCallerSpace}), and the caller's own accounts
 * when they may hold personal ones. At least one side is required.
 */
async function resolveCallerReach(
  hooks: ConnectionsOperationHooks,
  auth: OperationAuth,
  inputSpaceId: string | undefined
): Promise<ConnectionReach> {
  const personalUserId = await hooks.resolvePersonalReach(auth);
  const named = inputSpaceId?.trim() || auth.spaceId?.trim();
  if (!named) {
    if (!personalUserId) {
      throw new PluginOperationError(
        "connections.spaceRequired",
        "Connected accounts belong to a space; name one with space_id."
      );
    }
    return { personalUserId, spaceId: null };
  }
  return {
    personalUserId,
    spaceId: await resolveCallerSpace(hooks, auth, inputSpaceId),
  };
}

/** The caller's own accounts, or a 403 when they cannot hold any. */
async function requirePersonalOwner(
  hooks: ConnectionsOperationHooks,
  auth: OperationAuth
): Promise<string> {
  const userId = await hooks.resolvePersonalReach(auth);
  if (!userId) {
    throw forbiddenError(
      "connections.personalNeedsPerson",
      "Only a person, or their Copilot, has personal accounts."
    );
  }
  return userId;
}

async function getConnectionOrThrow(
  repo: ConnectionsRepo,
  auth: OperationAuth,
  connectionId: string
): Promise<ConnectionSummary> {
  const connection = await repo.getConnection({
    connectionId,
    tenantId: auth.tenantId,
  });
  if (!connection) {
    // 404, not 500: the id names nothing in this tenant, which is something
    // the caller did — and the same answer a connection they may not see gets,
    // deliberately, so this cannot be used to probe for other Spaces' rows.
    throw notFoundError(
      "connection_not_found",
      "No such connection in this tenant."
    );
  }
  return connection;
}

/**
 * The caller may use this account: it belongs to a Space they can act in, or
 * it is their own.
 */
async function assertCanUseOrThrow(
  repo: ConnectionsRepo,
  hooks: ConnectionsOperationHooks,
  auth: OperationAuth,
  connectionId: string
): Promise<ConnectionSummary> {
  const connection = await getConnectionOrThrow(repo, auth, connectionId);
  if (!connection.space_id) {
    if (connection.owner_user_id !== (await hooks.resolvePersonalReach(auth))) {
      throw notFoundError(
        "connection_not_found",
        "No such connection in this tenant."
      );
    }
    return connection;
  }
  try {
    await resolveCallerSpace(hooks, auth, connection.space_id);
  } catch {
    throw notFoundError(
      "connection_not_found",
      "No such connection in this tenant."
    );
  }
  return connection;
}

/**
 * The caller may change or decide for this account: an owner of its Space or
 * a tenant admin; for a personal account, its owner and nobody else. A caller
 * who cannot even enter the Space gets the same 404 as for a missing id.
 */
async function assertCanManageOrThrow(
  repo: ConnectionsRepo,
  hooks: ConnectionsOperationHooks,
  auth: OperationAuth,
  connectionId: string
): Promise<ConnectionSummary> {
  const connection = await getConnectionOrThrow(repo, auth, connectionId);
  if (!connection.space_id) {
    if (!(isUser(auth) && connection.owner_user_id === auth.principalId)) {
      throw notFoundError(
        "connection_not_found",
        "No such connection in this tenant."
      );
    }
    return connection;
  }
  if (isTenantAdmin(auth)) {
    return connection;
  }
  const access = isUser(auth)
    ? await hooks.resolveSpaceAccess({
        tenantId: auth.tenantId,
        userId: auth.principalId,
      })
    : new Map();
  if (!access.has(connection.space_id)) {
    throw notFoundError(
      "connection_not_found",
      "No such connection in this tenant."
    );
  }
  if (!canManageSpace(access, auth, connection.space_id)) {
    throw forbiddenError(
      "connection_not_space_owner",
      "Only an owner of the connection's space or a tenant admin can change this."
    );
  }
  return connection;
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
    summary:
      "List available connectors and a Space's (or your own) connected accounts",
    description:
      'Connector catalog with per-action permission matrix and the accounts the Space owns (`space_id`, else the current Space), or with `owner: "me"` the caller\'s own personal accounts.',
    idempotent: true,
    riskLevel: "low",
    requiredCapabilities: ["module.connections.read"],
    inputSchema: z
      .object({
        owner: z.enum(["me", "space"]).optional(),
        space_id: spaceIdInput,
      })
      .optional(),
    handler: async (input, ctx) => {
      if (!ctx.auth) {
        throw new Error("unauthorized");
      }
      const { tenantId } = ctx.auth;
      const parsed = (input ?? {}) as {
        owner?: "me" | "space";
        space_id?: string;
      };
      const repo = getRepo(ctx.auth);
      const connectors = listConnectorDefinitions(tenantId);
      let spaceId: string | null = null;
      let visible: ConnectionSummary[];
      // Whether the caller may change settings / policies / disconnect here —
      // the UI hides the controls rather than letting a member hit a 403.
      let canManage: boolean;
      if (parsed.owner === "me") {
        const ownerUserId = await requirePersonalOwner(hooks, ctx.auth);
        visible = await repo.listConnections({ ownerUserId, tenantId });
        canManage = isUser(ctx.auth);
      } else {
        spaceId = await resolveCallerSpace(hooks, ctx.auth, parsed.space_id);
        visible = await repo.listConnections({ spaceId, tenantId });
        canManage =
          isTenantAdmin(ctx.auth) ||
          (isUser(ctx.auth) &&
            canManageSpace(
              await hooks.resolveSpaceAccess({
                tenantId,
                userId: ctx.auth.principalId,
              }),
              ctx.auth,
              spaceId
            ));
      }
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
        can_manage: canManage,
        owner: parsed.owner === "me" ? "me" : "space",
        space_id: spaceId,
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
      "Use when the user needs to connect an integration (e.g. their email or calendar) before you can act. Pick who the account belongs to with `owner`: " +
      PERSONAL_OWNER_NOTE +
      " Default: `me` when the caller can hold personal accounts (a person, or their Copilot), else `space` (the current space, or `space_id`). Returns the connector's connect state: `configured` (client credentials exist so a connect flow can start), `connected` (the space already has a usable account), the connected `accounts`, and `auth_kind`. When configured and not connected, a connect button is shown to the user in chat; it stays in the conversation and turns to connected on its own once the user connects. Call this at most once per connector per conversation: if you already requested it earlier (including before an approval or a resumed run), do not call it again — point the user at the existing card, and after they say they connected, check with connections_list_accounts. When not configured, the card offers an admin the credentials form in place and lets anyone else ask an admin; tell the user an admin must add the connector's OAuth client in Setup → Connections (`/setup/connections`, tenant admin) or Setup → Platform settings (`/setup/platform`, superadmin, installation-wide) — not in Setup → Plugins.",
    idempotent: true,
    riskLevel: "low",
    requiredCapabilities: ["module.connections.read"],
    inputSchema: z.object({
      connector_id: z.string().describe('Connector id (e.g. "google-gmail").'),
      owner: z
        .enum(["me", "space"])
        .optional()
        .describe(`Who the account belongs to. ${PERSONAL_OWNER_NOTE}`),
      space_id: spaceIdInput,
    }),
    handler: async (input, ctx) => {
      if (!ctx.auth) {
        throw new Error("unauthorized");
      }
      const { connector_id, owner, space_id } = input as {
        connector_id: string;
        owner?: "me" | "space";
        space_id?: string;
      };
      const personalUserId =
        owner === "space" ? null : await hooks.resolvePersonalReach(ctx.auth);
      if (owner === "me" && !personalUserId) {
        throw forbiddenError(
          "connections.personalNeedsPerson",
          "Only a person, or their Copilot, has personal accounts."
        );
      }
      const spaceId = personalUserId
        ? null
        : await resolveCallerSpace(hooks, ctx.auth, space_id);
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
        reach: { personalUserId, spaceId },
        tenantId: ctx.auth.tenantId,
      });
      return {
        // The connect card starts OAuth for THIS owner — the person (`me`)
        // or this Space.
        owner: personalUserId ? "me" : "space",
        space_id: spaceId,
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

  // ── Organisation catalog: who holds accounts, counts only ─────────────────
  // Setup → Connections shows per connector how many Spaces and persons hold
  // an account. Never names: a person's own accounts stay theirs.
  api.registerOperation({
    operationId: "connections_usage",
    moduleId: "connections",
    spacePolicy: ACCOUNT_MOUNTED,
    summary: "Count the Spaces and persons holding an account, per connector",
    description:
      "Tenant admins: per connector, how many Spaces and how many persons hold a connected account. Counts only — no account names.",
    idempotent: true,
    riskLevel: "low",
    requiredCapabilities: ["module.connections.read"],
    inputSchema: z.object({}).optional(),
    handler: async (_input, ctx) => {
      if (!ctx.auth) {
        throw new Error("unauthorized");
      }
      if (!isTenantAdmin(ctx.auth)) {
        throw forbiddenError(
          "connections.usageAdminOnly",
          "Only a tenant admin sees the Organisation's connection counts."
        );
      }
      const all = await getRepo(ctx.auth).listConnections({
        tenantId: ctx.auth.tenantId,
      });
      const byConnector = new Map<
        string,
        { accounts: number; persons: Set<string>; spaces: Set<string> }
      >();
      for (const connection of all) {
        const entry = byConnector.get(connection.connector_id) ?? {
          accounts: 0,
          persons: new Set<string>(),
          spaces: new Set<string>(),
        };
        entry.accounts += 1;
        if (connection.space_id) {
          entry.spaces.add(connection.space_id);
        } else if (connection.owner_user_id) {
          entry.persons.add(connection.owner_user_id);
        }
        byConnector.set(connection.connector_id, entry);
      }
      return {
        usage: [...byConnector.entries()].map(([connectorId, entry]) => ({
          account_count: entry.accounts,
          connector_id: connectorId,
          person_count: entry.persons.size,
          space_count: entry.spaces.size,
        })),
      };
    },
  });

  // ── "Ask an admin": a connector nobody can connect yet ────────────────────
  api.registerOperation({
    operationId: "connections_request_setup",
    moduleId: "connections",
    spacePolicy: ACCOUNT_MOUNTED,
    summary: "Ask the Organisation's admins to add a connector's credentials",
    description:
      "When a connector is not configured (no OAuth client), a person asks the tenant admins to add its credentials. Each admin gets one notification per connector.",
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
      if (!isUser(ctx.auth)) {
        throw forbiddenError(
          "connections.setupRequestNeedsPerson",
          "Only a person asks the admins."
        );
      }
      const { connector_id } = input as { connector_id: string };
      const connector = getConnectorDefinition(connector_id, ctx.auth.tenantId);
      if (!connector) {
        throw notFoundError("connector_not_found", "No such connector.");
      }
      const notified = await hooks.askAdminsForSetup({
        connector: { id: connector.id, name: connector.name },
        requesterId: ctx.auth.principalId,
        tenantId: ctx.auth.tenantId,
      });
      return { notified };
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
      "Accounts this call can use for a connector — the current space's (or `space_id`'s) and, for a person or their Copilot, their own — addressable on its actions via the optional `account` input param. Use when an action fails with connection_ambiguous.",
    idempotent: true,
    riskLevel: "low",
    requiredCapabilities: ["module.connections.read"],
    inputSchema: z.object({
      connector_id: z.string().describe('Connector id (e.g. "google-gmail").'),
      space_id: spaceIdInput,
    }),
    handler: async (input, ctx) => {
      if (!ctx.auth) {
        throw new Error("unauthorized");
      }
      const parsed = input as { connector_id: string; space_id?: string };
      const reach = await resolveCallerReach(hooks, ctx.auth, parsed.space_id);
      const candidates = await getRepo(ctx.auth).listCandidateConnections({
        connectorId: parsed.connector_id,
        reach,
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
      "Active connections of the current space (or `space_id`) whose connector declares the storage (write) capability. Used to pick where project artifacts are mirrored.",
    idempotent: true,
    riskLevel: "low",
    requiredCapabilities: ["module.connections.read"],
    inputSchema: z.object({ space_id: spaceIdInput }).optional(),
    handler: async (input, ctx) => {
      if (!ctx.auth) {
        throw new Error("unauthorized");
      }
      const { tenantId } = ctx.auth;
      const spaceId = await resolveCallerSpace(
        hooks,
        ctx.auth,
        (input as { space_id?: string } | undefined)?.space_id
      );
      const connections = await getRepo(ctx.auth).listConnections({
        spaceId,
        tenantId,
      });
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
      const connection = await assertCanUseOrThrow(
        repo,
        hooks,
        ctx.auth,
        parsed.connection_id
      );
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
    spacePolicy: ACCOUNT_MOUNTED,
    summary: "Update the autonomous mode or display name of a connection",
    description:
      "Owners of the connection's space (and tenant admins) only. `autonomous_mode` is how far the space's agents may go with the account unattended.",
    riskLevel: "medium",
    requiredCapabilities: ["module.connections.write"],
    inputSchema: connectionIdSchema.extend({
      autonomous_mode: z.enum(["off", "read_only", "full"]).optional(),
      display_name: z.string().max(200).nullable().optional(),
    }),
    handler: async (input, ctx) => {
      if (!ctx.auth) {
        throw new Error("unauthorized");
      }
      const parsed = input as z.infer<typeof connectionIdSchema> & {
        autonomous_mode?: "off" | "read_only" | "full";
        display_name?: string | null;
      };
      const repo = getRepo(ctx.auth);
      await assertCanManageOrThrow(repo, hooks, ctx.auth, parsed.connection_id);
      await repo.updateConnectionSettings({
        autonomousMode: parsed.autonomous_mode,
        connectionId: parsed.connection_id,
        displayName: parsed.display_name,
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
    description: "Owners of the connection's space (and tenant admins) only.",
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
      await assertCanManageOrThrow(repo, hooks, ctx.auth, parsed.connection_id);
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
    description: "Owners of the connection's space (and tenant admins) only.",
    riskLevel: "high",
    requiredCapabilities: ["module.connections.write"],
    inputSchema: connectionIdSchema,
    handler: async (input, ctx) => {
      if (!ctx.auth) {
        throw new Error("unauthorized");
      }
      const parsed = input as { connection_id: string };
      const repo = getRepo(ctx.auth);
      await assertCanManageOrThrow(repo, hooks, ctx.auth, parsed.connection_id);
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
    summary:
      "List connection approval requests the caller may decide (owners of the connection's space, tenant admins)",
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
      const { auth } = ctx;
      const { tenantId } = auth;
      const repo = getRepo(auth);
      const requests = await repo.listApprovalRequests({
        status: parsed.status ?? "pending",
        tenantId,
      });
      if (!isUser(ctx.auth)) {
        return { requests: [] };
      }
      const access = await hooks.resolveSpaceAccess({
        tenantId,
        userId: ctx.auth.principalId,
      });
      const byId = new Map(
        (await repo.listConnections({ tenantId })).map((c) => [c.id, c])
      );
      return {
        requests: requests.filter((request) => {
          const connection = byId.get(request.connection_id);
          if (!connection) {
            return false;
          }
          // A tenant admin decides for every Space's accounts; a personal
          // account's requests are its owner's alone.
          return connection.space_id
            ? isTenantAdmin(auth) ||
                canManageSpace(access, auth, connection.space_id)
            : connection.owner_user_id === auth.principalId;
        }),
      };
    },
  });

  api.registerOperation({
    operationId: "connections_approvals_decide",
    moduleId: "connections",
    spacePolicy: ACCOUNT_MOUNTED,
    summary: "Approve or deny a pending connection approval request",
    description: "Owners of the connection's space (and tenant admins) only.",
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
      // Approver check BEFORE deciding. It used to run after: a non-approver's
      // decide flipped the row to decided, then threw — burning the request
      // so an actual approver found nothing left to approve.
      const pendingRequest = await repo.getApprovalRequest(parsed.request_id);
      if (
        !pendingRequest ||
        pendingRequest.tenant_id !== ctx.auth.tenantId ||
        pendingRequest.status !== "pending"
      ) {
        throw new Error("approval_request_not_pending");
      }
      await assertCanManageOrThrow(
        repo,
        hooks,
        ctx.auth,
        pendingRequest.connection_id
      );
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
      "Operation ids durably allowed on the connections this call reaches — the current space's and the caller's own (merged into chat approval grants)",
    idempotent: true,
    riskLevel: "low",
    requiredCapabilities: ["module.connections.read"],
    inputSchema: z.object({ space_id: spaceIdInput }).optional(),
    handler: async (input, ctx) => {
      if (!ctx.auth) {
        throw new Error("unauthorized");
      }
      const { principalId, tenantId } = ctx.auth;
      const inputSpaceId = (input as { space_id?: string } | undefined)
        ?.space_id;
      const personalUserId = await hooks.resolvePersonalReach(ctx.auth);
      const named = inputSpaceId?.trim() || ctx.auth.spaceId?.trim();
      // No Space and no person, no accounts — and so nothing granted on one.
      if (!(named || personalUserId)) {
        return { operation_ids: [] };
      }
      const spaceId = named
        ? await resolveCallerSpace(hooks, ctx.auth, inputSpaceId)
        : null;
      const repo = getRepo(ctx.auth);
      const [space, personal] = await Promise.all([
        spaceId ? repo.listConnections({ spaceId, tenantId }) : [],
        personalUserId
          ? repo.listConnections({ ownerUserId: personalUserId, tenantId })
          : [],
      ]);
      const usable = [...space, ...personal].filter(
        (c) => c.status === "active"
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
}
