import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createConnectionsModuleClientFromRepo } from "./client.js";
import {
  __resetConnectorRegistryForTests,
  registerConnectorDefinition,
} from "./registry.js";
import type { ConnectionsRepo } from "./repo.js";
import type {
  ConnectionSummary,
  ConnectorDefinition,
  StreamPullResult,
} from "./types.js";

function connection(
  overrides: Partial<ConnectionSummary> & { id: string }
): ConnectionSummary {
  return {
    auth_kind: "oauth2",
    autonomous_mode: "read_only",
    connector_id: "google-gmail",
    created_at: "2026-07-04T00:00:00Z",
    display_name: null,
    error_message: null,
    external_account: "office@x.com",
    granted_scopes: [],
    non_owner_max_group: null,
    owner_user_id: "user-1",
    sharing: "org",
    status: "active",
    tenant_id: "tenant-1",
    ...overrides,
  };
}

function fakeRepo(connections: ConnectionSummary[]): ConnectionsRepo {
  return {
    getConnection: async ({ connectionId }: { connectionId: string }) =>
      connections.find((c) => c.id === connectionId) ?? null,
    listApprovalRequests: async () => [],
    listCandidateConnections: async () =>
      connections.filter((c) => c.status === "active"),
    listConnections: async (params: { connectorId?: string }) =>
      connections.filter(
        (c) => !params.connectorId || c.connector_id === params.connectorId
      ),
    listPolicyOverrides: async () => [],
    withFreshAccessToken: async (
      _params: unknown,
      use: (token: string) => Promise<unknown>
    ) => use("token-abc"),
  } as unknown as ConnectionsRepo;
}

const pullResult: StreamPullResult = {
  hasMore: false,
  items: [
    {
      attachments: [],
      body_html: null,
      body_text: "hello",
      cc: [],
      from_email: "a@x.com",
      from_name: null,
      provider_message_id: "m-1",
      provider_thread_id: "t-1",
      received_at: "2026-07-04T00:00:00Z",
      subject: "Hi",
      to: ["office@x.com"],
    },
  ],
  nextCursor: "42",
};

function registerGmail(pull = vi.fn(async () => pullResult)) {
  const connector: ConnectorDefinition = {
    actions: [
      {
        description: "Search",
        group: "read",
        handler: async (_input, ctx) => ({ token: ctx.accessToken }),
        id: "search_threads",
        inputSchema: z.object({}).passthrough(),
        summary: "Search",
      },
      {
        description: "Draft",
        group: "write",
        handler: async () => ({ drafted: true }),
        id: "create_draft",
        inputSchema: z.object({}).passthrough(),
        summary: "Draft",
      },
    ],
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
    stream: { kind: "messages", pull },
    toolPrefix: "gmail",
  };
  registerConnectorDefinition(connector);
  return { connector, pull };
}

beforeEach(() => {
  __resetConnectorRegistryForTests();
});

describe("createConnectionsModuleClientFromRepo", () => {
  it("lists only active connections", async () => {
    registerGmail();
    const client = createConnectionsModuleClientFromRepo(
      fakeRepo([
        connection({ id: "c-1" }),
        connection({ id: "c-2", status: "error" }),
      ]),
      { moduleId: "inbox" }
    );
    const listed = await client.listConnections({ tenantId: "tenant-1" });
    expect(listed.map((c) => c.id)).toEqual(["c-1"]);
  });

  it("calls a read action on a read_only connection autonomously", async () => {
    registerGmail();
    const client = createConnectionsModuleClientFromRepo(
      fakeRepo([connection({ id: "c-1" })]),
      { moduleId: "inbox" }
    );
    const output = await client.callAction({
      actionId: "search_threads",
      connectionId: "c-1",
      input: {},
      isAutonomous: true,
      principal: { principalId: "user-1", principalType: "service" },
      tenantId: "tenant-1",
    });
    expect(output).toEqual({ token: "token-abc" });
  });

  it("denies the same call when autonomous_mode is off", async () => {
    registerGmail();
    const client = createConnectionsModuleClientFromRepo(
      fakeRepo([connection({ autonomous_mode: "off", id: "c-1" })]),
      { moduleId: "inbox" }
    );
    await expect(
      client.callAction({
        actionId: "search_threads",
        connectionId: "c-1",
        input: {},
        isAutonomous: true,
        principal: { principalId: "user-1", principalType: "service" },
        tenantId: "tenant-1",
      })
    ).rejects.toMatchObject({ code: "connection_denied" });
  });

  it("turns an autonomous write ask into an approval request error", async () => {
    registerGmail();
    const created: unknown[] = [];
    const repo = fakeRepo([connection({ autonomous_mode: "full", id: "c-1" })]);
    (repo as { createApprovalRequest: unknown }).createApprovalRequest = async (
      input: unknown
    ) => {
      created.push(input);
      return {
        connection_id: "c-1",
        id: "req-1",
        status: "pending",
      };
    };
    const client = createConnectionsModuleClientFromRepo(repo, {
      moduleId: "inbox",
    });
    await expect(
      client.callAction({
        actionId: "create_draft",
        connectionId: "c-1",
        input: {},
        isAutonomous: true,
        principal: { principalId: "user-1", principalType: "service" },
        tenantId: "tenant-1",
      })
    ).rejects.toMatchObject({ code: "connection_approval_pending" });
    expect(created).toHaveLength(1);
  });

  it("pulls the stream on a read_only connection and audits the pull", async () => {
    const { pull } = registerGmail();
    const audit = vi.fn();
    const client = createConnectionsModuleClientFromRepo(
      fakeRepo([connection({ id: "c-1" })]),
      { moduleId: "inbox", recordAuditEvent: audit }
    );
    const result = await client.pullStream({
      connectionId: "c-1",
      cursor: null,
      limit: 25,
      tenantId: "tenant-1",
    });
    expect(result).toEqual(pullResult);
    expect(pull).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "token-abc", limit: 25 }),
      null
    );
    expect(audit).toHaveBeenCalledWith({
      detail: {
        connection_id: "c-1",
        consumer_module: "inbox",
        item_count: 1,
      },
      type: "connection.stream_pulled",
    });
  });

  it("denies stream pulls when autonomous_mode is off", async () => {
    registerGmail();
    const client = createConnectionsModuleClientFromRepo(
      fakeRepo([connection({ autonomous_mode: "off", id: "c-1" })]),
      { moduleId: "inbox" }
    );
    await expect(
      client.pullStream({
        connectionId: "c-1",
        cursor: null,
        tenantId: "tenant-1",
      })
    ).rejects.toMatchObject({ code: "connection_denied" });
  });

  it("rejects stream pulls on connectors without a stream capability", async () => {
    const { connector } = registerGmail();
    const { stream: _stream, ...withoutStream } = connector;
    __resetConnectorRegistryForTests();
    registerConnectorDefinition(withoutStream as ConnectorDefinition);
    const client = createConnectionsModuleClientFromRepo(
      fakeRepo([connection({ id: "c-1" })]),
      { moduleId: "inbox" }
    );
    await expect(
      client.pullStream({
        connectionId: "c-1",
        cursor: null,
        tenantId: "tenant-1",
      })
    ).rejects.toMatchObject({ code: "connection_stream_unsupported" });
  });
});
