import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ConnectionsActionError } from "./errors.js";
import { executeConnectorAction } from "./execute.js";
import type { ConnectionsRepo } from "./repo.js";
import type {
  ApprovalRequestRecord,
  ConnectionPolicyOverride,
  ConnectionSummary,
  ConnectorAction,
  ConnectorDefinition,
} from "./types.js";

function connection(
  overrides: Partial<ConnectionSummary> & { id: string }
): ConnectionSummary {
  return {
    all_spaces: false,
    auth_kind: "oauth2",
    autonomous_mode: "off",
    connector_id: "google-gmail",
    created_at: "2026-07-04T00:00:00Z",
    display_name: null,
    error_message: null,
    external_account: null,
    granted_scopes: [],
    non_owner_max_group: null,
    owner_user_id: "user-1",
    sharing: "personal",
    status: "active",
    tenant_id: "tenant-1",
    ...overrides,
  };
}

interface FakeRepoState {
  connections: ConnectionSummary[];
  /** Standing core approval grants the gate may consume, by operation id. */
  grants?: string[];
  overrides?: ConnectionPolicyOverride[];
  pending?: Partial<ApprovalRequestRecord>[];
}

function fakeRepo(state: FakeRepoState) {
  const createdRequests: Record<string, unknown>[] = [];
  const grants = [...(state.grants ?? [])];
  const repo = {
    consumeApprovalGrant: async ({ operationId }: { operationId: string }) => {
      const at = grants.indexOf(operationId);
      if (at === -1) {
        return false;
      }
      grants.splice(at, 1);
      return true;
    },
    createApprovalRequest: async (input: Record<string, unknown>) => {
      createdRequests.push(input);
      return {
        action_id: input.actionId,
        connection_id: input.connectionId,
        created_at: "2026-07-04T00:00:00Z",
        decided_at: null,
        decided_by: null,
        id: "req-1",
        input_summary: null,
        operation_id: input.operationId,
        requested_by: input.requestedBy,
        status: "pending",
        task_id: input.taskId ?? null,
        tenant_id: input.tenantId,
      } as ApprovalRequestRecord;
    },
    getConnection: async ({ connectionId }: { connectionId: string }) =>
      state.connections.find((c) => c.id === connectionId) ?? null,
    listApprovalRequests: async () =>
      (state.pending ?? []) as ApprovalRequestRecord[],
    listCandidateConnections: async (params: {
      agentGrantedConnectionIds?: ReadonlySet<string>;
      connectorId: string;
      principalId: string;
      spaceOwnerUserId?: string | null;
    }) =>
      state.connections.filter(
        (c) => c.status === "active" && c.connector_id === params.connectorId
      ),
    listAgentGrantedConnectionIds: async () => new Set<string>(),
    listPolicyOverrides: async (ids: string[]) =>
      (state.overrides ?? []).filter((o) => ids.includes(o.connection_id)),
    withFreshAccessToken: async (
      _params: unknown,
      use: (token: string) => Promise<unknown>
    ) => use("token-123"),
  } as unknown as ConnectionsRepo;
  return { createdRequests, repo };
}

function makeAction(overrides: Partial<ConnectorAction> = {}): ConnectorAction {
  return {
    description: "Search threads",
    group: "read",
    handler: async () => ({ ok: true }),
    id: "search_threads",
    inputSchema: z.object({}).passthrough(),
    summary: "Search",
    ...overrides,
  };
}

const connector = {
  actions: [],
  auth: {
    kind: "oauth2",
    oauth2: {
      authUrl: "https://example.com/auth",
      baseScopes: [],
      clientIdEnv: "X_ID",
      clientSecretEnv: "X_SECRET",
      tokenUrl: "https://example.com/token",
    },
  },
  description: "Gmail",
  id: "google-gmail",
  moduleId: "connections-google",
  name: "Gmail",
  toolPrefix: "gmail",
} as unknown as ConnectorDefinition;

const user = { principalId: "user-1", principalType: "user" as const };

describe("executeConnectorAction", () => {
  it("executes on the single candidate with a fresh access token", async () => {
    const target = connection({ external_account: "alice@x.com", id: "c-1" });
    const { repo } = fakeRepo({ connections: [target] });
    const handler = vi.fn(async (_input, ctx) => ({ token: ctx.accessToken }));
    const audit = vi.fn();
    const result = await executeConnectorAction({
      action: makeAction({ handler }),
      connector,
      input: { q: "is:unread" },
      isAutonomous: false,
      moduleId: "inbox",
      principal: user,
      recordAuditEvent: audit,
      repo,
      tenantId: "tenant-1",
    });
    expect(result.connection.id).toBe("c-1");
    expect(result.output).toEqual({ token: "token-123" });
    expect(handler).toHaveBeenCalledWith(
      { q: "is:unread" },
      expect.objectContaining({ accessToken: "token-123" })
    );
    expect(audit).toHaveBeenCalledWith({
      detail: {
        action: "search_threads",
        connection_id: "c-1",
        consumer_module: "inbox",
      },
      type: "connection.action_executed",
    });
  });

  it("runs browser-kind handlers with an empty token, no refresh", async () => {
    const browserConnector = {
      ...connector,
      auth: { kind: "browser" },
      id: "local-files",
      moduleId: "connections-local-files",
      toolPrefix: "local_files",
    } as unknown as ConnectorDefinition;
    const target = connection({
      auth_kind: "browser",
      connector_id: "local-files",
      external_account: "Docs — Chrome",
      id: "c-browser",
    });
    const { repo } = fakeRepo({ connections: [target] });
    const withFresh = vi.spyOn(repo, "withFreshAccessToken");
    const handler = vi.fn(async (_input, ctx) => ({ token: ctx.accessToken }));
    const result = await executeConnectorAction({
      action: makeAction({ handler, id: "list_directory" }),
      connector: browserConnector,
      input: {},
      isAutonomous: false,
      moduleId: "files",
      principal: user,
      repo,
      tenantId: "tenant-1",
    });
    expect(result.output).toEqual({ token: "" });
    expect(handler).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ accessToken: "" })
    );
    expect(withFresh).not.toHaveBeenCalled();
  });

  it("targets the account addressed via the account param", async () => {
    const personal = connection({
      external_account: "alice@x.com",
      id: "c-personal",
    });
    const org = connection({
      all_spaces: true,
      external_account: "office@x.com",
      id: "c-org",
      owner_user_id: "admin-1",
    });
    const { repo } = fakeRepo({ connections: [personal, org] });
    const result = await executeConnectorAction({
      account: "office",
      action: makeAction(),
      connector,
      input: {},
      isAutonomous: false,
      principal: user,
      repo,
      tenantId: "tenant-1",
    });
    expect(result.connection.id).toBe("c-org");
  });

  it("throws connection_ambiguous with candidates when several accounts match", async () => {
    const { repo } = fakeRepo({
      connections: [
        connection({ external_account: "alice@x.com", id: "c-1" }),
        connection({
          all_spaces: true,
          external_account: "office@x.com",
          id: "c-2",
          owner_user_id: "admin-1",
        }),
      ],
    });
    const error = await executeConnectorAction({
      action: makeAction(),
      connector,
      input: {},
      isAutonomous: false,
      principal: user,
      repo,
      tenantId: "tenant-1",
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConnectionsActionError);
    const typed = error as ConnectionsActionError;
    expect(typed.code).toBe("connection_ambiguous");
    expect(typed.message).toContain("alice@x.com");
    expect(typed.details.candidates).toHaveLength(2);
  });

  it("throws connection_not_connected when nothing is connected", async () => {
    const { repo } = fakeRepo({ connections: [] });
    await expect(
      executeConnectorAction({
        action: makeAction(),
        connector,
        input: {},
        isAutonomous: false,
        principal: user,
        repo,
        tenantId: "tenant-1",
      })
    ).rejects.toMatchObject({ code: "connection_not_connected" });
  });

  it("denies autonomous execution when autonomous_mode is off", async () => {
    const { repo } = fakeRepo({
      connections: [
        connection({
          autonomous_mode: "off",
          id: "c-1",
          owner_user_id: "svc-1",
        }),
      ],
    });
    await expect(
      executeConnectorAction({
        action: makeAction(),
        connector,
        input: {},
        isAutonomous: true,
        principal: { principalId: "svc-1", principalType: "service" },
        repo,
        tenantId: "tenant-1",
      })
    ).rejects.toMatchObject({ code: "connection_denied" });
  });

  it("records an approval request and throws for an autonomous ask", async () => {
    const target = connection({
      autonomous_mode: "full",
      id: "c-1",
      owner_user_id: "svc-1",
    });
    const { createdRequests, repo } = fakeRepo({ connections: [target] });
    const handler = vi.fn();
    const onApprovalRequested = vi.fn();
    const error = await executeConnectorAction({
      action: makeAction({ group: "write", handler, id: "create_draft" }),
      connector,
      input: {},
      isAutonomous: true,
      onApprovalRequested,
      principal: { principalId: "svc-1", principalType: "service" },
      repo,
      taskId: "task-7",
      tenantId: "tenant-1",
    }).catch((e: unknown) => e);
    expect((error as ConnectionsActionError).code).toBe(
      "connection_approval_pending"
    );
    expect(handler).not.toHaveBeenCalled();
    expect(createdRequests).toEqual([
      {
        actionId: "create_draft",
        connectionId: "c-1",
        operationId: "gmail_create_draft",
        requestedBy: "svc-1",
        taskId: "task-7",
        tenantId: "tenant-1",
      },
    ]);
    expect(onApprovalRequested).toHaveBeenCalledWith(
      expect.objectContaining({ id: "req-1", status: "pending" })
    );
  });

  it("spends a standing grant instead of re-asking — approve must unblock", async () => {
    // The regression this whole fold fixes: a human's "approve" minted
    // nothing the retried run could use, so the same ask re-queued forever.
    const target = connection({
      autonomous_mode: "full",
      id: "c-1",
      owner_user_id: "svc-1",
    });
    const { createdRequests, repo } = fakeRepo({
      connections: [target],
      grants: ["gmail_create_draft"],
    });
    const handler = vi.fn(() => Promise.resolve({ ok: true }));
    const first = await executeConnectorAction({
      action: makeAction({ group: "write", handler, id: "create_draft" }),
      connector,
      input: {},
      isAutonomous: true,
      principal: { principalId: "svc-1", principalType: "service" },
      repo,
      taskId: "task-7",
      tenantId: "tenant-1",
    });
    expect(first.output).toEqual({ ok: true });
    expect(createdRequests).toHaveLength(0);

    // The grant was one-shot: the second identical call is gated again.
    await expect(
      executeConnectorAction({
        action: makeAction({ group: "write", handler, id: "create_draft" }),
        connector,
        input: {},
        isAutonomous: true,
        principal: { principalId: "svc-1", principalType: "service" },
        repo,
        taskId: "task-7",
        tenantId: "tenant-1",
      })
    ).rejects.toMatchObject({ code: "connection_approval_pending" });
  });

  it("dedupes the approval request while an identical one is pending", async () => {
    const target = connection({
      autonomous_mode: "full",
      id: "c-1",
      owner_user_id: "svc-1",
    });
    const { createdRequests, repo } = fakeRepo({
      connections: [target],
      pending: [
        {
          connection_id: "c-1",
          operation_id: "gmail_create_draft",
          requested_by: "svc-1",
        },
      ],
    });
    const onApprovalRequested = vi.fn();
    await expect(
      executeConnectorAction({
        action: makeAction({ group: "write", id: "create_draft" }),
        connector,
        input: {},
        isAutonomous: true,
        onApprovalRequested,
        principal: { principalId: "svc-1", principalType: "service" },
        repo,
        tenantId: "tenant-1",
      })
    ).rejects.toMatchObject({ code: "connection_approval_pending" });
    expect(createdRequests).toHaveLength(0);
    expect(onApprovalRequested).not.toHaveBeenCalled();
  });

  it("executes an autonomous write when an allow override is set", async () => {
    const target = connection({
      autonomous_mode: "full",
      id: "c-1",
      owner_user_id: "svc-1",
    });
    const { repo } = fakeRepo({
      connections: [target],
      overrides: [
        { connection_id: "c-1", policy: "allow", selector: "create_draft" },
      ],
    });
    const result = await executeConnectorAction({
      action: makeAction({ group: "write", id: "create_draft" }),
      connector,
      input: {},
      isAutonomous: true,
      principal: { principalId: "svc-1", principalType: "service" },
      repo,
      tenantId: "tenant-1",
    });
    expect(result.output).toEqual({ ok: true });
  });

  it("proceeds through ask for live principals (pre-gate owns approval)", async () => {
    const { repo } = fakeRepo({ connections: [connection({ id: "c-1" })] });
    const result = await executeConnectorAction({
      action: makeAction({ group: "write", id: "create_draft" }),
      connector,
      input: {},
      isAutonomous: false,
      principal: user,
      repo,
      tenantId: "tenant-1",
    });
    expect(result.output).toEqual({ ok: true });
  });

  it("rejects direct connection ids that belong to another connector", async () => {
    const { repo } = fakeRepo({
      connections: [connection({ connector_id: "google-drive", id: "c-1" })],
    });
    await expect(
      executeConnectorAction({
        action: makeAction(),
        connectionId: "c-1",
        connector,
        input: {},
        isAutonomous: false,
        principal: user,
        repo,
        tenantId: "tenant-1",
      })
    ).rejects.toMatchObject({ code: "connection_not_connected" });
  });
});

describe("executeConnectorAction — space parity (§2.1 / CN.3)", () => {
  const service = { principalId: "svc-1", principalType: "service" as const };

  it("reaches the verified space owner's personal account headless", async () => {
    const target = connection({
      autonomous_mode: "full",
      id: "c-own",
      owner_user_id: "owner-9",
    });
    const { repo } = fakeRepo({ connections: [target] });
    const result = await executeConnectorAction({
      action: makeAction(),
      connector,
      input: {},
      isAutonomous: true,
      mountedConnectionAccess: new Map([["c-own", null]]),
      principal: service,
      repo,
      spaceOwnerUserId: "owner-9",
      tenantId: "tenant-1",
    });
    expect(result.connection.id).toBe("c-own");
  });

  it("refuses when the space mounts none of the candidates", async () => {
    const target = connection({
      autonomous_mode: "full",
      id: "c-own",
      owner_user_id: "owner-9",
    });
    const { repo } = fakeRepo({ connections: [target] });
    await expect(
      executeConnectorAction({
        action: makeAction(),
        connector,
        input: {},
        isAutonomous: true,
        mountedConnectionAccess: new Map(),
        principal: service,
        repo,
        spaceOwnerUserId: "owner-9",
        tenantId: "tenant-1",
      })
    ).rejects.toMatchObject({ code: "connection_not_in_space" });
  });

  it("applies the mount level to the resolved connection", async () => {
    const target = connection({
      autonomous_mode: "full",
      id: "c-own",
      owner_user_id: "owner-9",
    });
    const { repo } = fakeRepo({ connections: [target] });
    await expect(
      executeConnectorAction({
        action: makeAction({ group: "write", id: "send" }),
        connector,
        input: {},
        isAutonomous: true,
        mountedConnectionAccess: new Map([["c-own", "read"]]),
        principal: service,
        repo,
        spaceOwnerUserId: "owner-9",
        tenantId: "tenant-1",
      })
    ).rejects.toMatchObject({ code: "connection_denied" });
  });

  it("unions an agent grant with space mounts (river rule)", async () => {
    const granted = connection({
      autonomous_mode: "full",
      id: "c-grant",
      owner_user_id: "someone-else",
    });
    const { repo } = fakeRepo({ connections: [granted] });
    repo.listAgentGrantedConnectionIds = async () => new Set(["c-grant"]);
    repo.listCandidateConnections = async (params: {
      agentGrantedConnectionIds?: ReadonlySet<string>;
      connectorId: string;
    }) => (params.agentGrantedConnectionIds?.has("c-grant") ? [granted] : []);
    const result = await executeConnectorAction({
      action: makeAction(),
      agentId: "engenty.copilot",
      connector,
      input: {},
      isAutonomous: true,
      mountedConnectionAccess: new Map(),
      principal: service,
      repo,
      tenantId: "tenant-1",
    });
    expect(result.connection.id).toBe("c-grant");
  });

  it("direct connectionId still executes without a space mount", async () => {
    const target = connection({
      autonomous_mode: "full",
      id: "c-own",
      owner_user_id: "owner-9",
    });
    const { repo } = fakeRepo({ connections: [target] });
    const result = await executeConnectorAction({
      action: makeAction(),
      connector,
      connectionId: "c-own",
      input: {},
      isAutonomous: true,
      principal: service,
      repo,
      tenantId: "tenant-1",
    });
    expect(result.connection.id).toBe("c-own");
  });
});
