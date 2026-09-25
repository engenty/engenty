import type {
  ApprovalRequestRecord,
  ConnectionSummary,
  ConnectionsRepo,
  SpaceAccessEntry,
} from "@engenty/connections-sdk";
import type {
  PluginAuthContext,
  PluginServerApi,
  PluginServerOperation,
} from "@engenty/plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import { registerConnectionsOperations } from "./operations.js";

// PLAN-space-owned-connections.md — members of a Space use its accounts; its
// owners (and tenant admins) change them and decide their approvals.

const TENANT = "t-1";
const SPACE = "00000000-0000-4000-8000-00000000aaaa";
const OTHER_SPACE = "00000000-0000-4000-8000-00000000bbbb";
const OWNER = "u-owner";
const MEMBER = "u-member";
const OUTSIDER = "u-outsider";
const CONNECTION_ID = "00000000-0000-4000-8000-0000000000c1";

const account: ConnectionSummary = {
  auth_kind: "oauth2",
  autonomous_mode: "off",
  connected_by: MEMBER,
  connector_id: "google-gmail",
  created_at: "2026-09-23T00:00:00.000Z",
  display_name: null,
  error_message: null,
  external_account: "team@example.com",
  granted_scopes: [],
  id: CONNECTION_ID,
  space_id: SPACE,
  status: "active",
  tenant_id: TENANT,
};

/** OWNER owns SPACE, MEMBER is a member of it, OUTSIDER has nothing. */
const ACCESS: Record<string, Map<string, SpaceAccessEntry>> = {
  [MEMBER]: new Map([[SPACE, { isOwner: false }]]),
  [OUTSIDER]: new Map(),
  [OWNER]: new Map([[SPACE, { isOwner: true }]]),
};

function setup() {
  const updateConnectionSettings = vi.fn(async () => undefined);
  const listCandidateConnections = vi.fn(async (params: { spaceId: string }) =>
    params.spaceId === SPACE ? [account] : []
  );
  const repo = {
    getConnection: async ({ connectionId }: { connectionId: string }) =>
      connectionId === CONNECTION_ID ? account : null,
    listApprovalRequests: async () =>
      [
        { connection_id: CONNECTION_ID, id: "r-1" },
        { connection_id: "gone", id: "r-2" },
      ] as ApprovalRequestRecord[],
    listCandidateConnections,
    listConnections: async () => [account],
    updateConnectionSettings,
  } as unknown as ConnectionsRepo;
  const operations = new Map<string, PluginServerOperation>();
  registerConnectionsOperations(
    {
      registerOperation: (operation: PluginServerOperation) => {
        operations.set(operation.operationId, operation);
      },
    } as unknown as PluginServerApi,
    () => repo,
    {
      onApprovalDecided: async () => undefined,
      resolveSpaceAccess: async ({ userId }) => ACCESS[userId] ?? new Map(),
      settings: { clientEnv: () => async () => undefined },
    }
  );
  const call = (
    operationId: string,
    input: unknown,
    auth: Partial<PluginAuthContext>
  ) => {
    const operation = operations.get(operationId);
    if (!operation) {
      throw new Error(`no operation ${operationId}`);
    }
    return (
      operation.handler as (
        input: unknown,
        ctx: { auth: Partial<PluginAuthContext> }
      ) => Promise<unknown>
    )(input, {
      auth: { principalType: "user", tenantId: TENANT, ...auth },
    });
  };
  return { call, listCandidateConnections, updateConnectionSettings };
}

describe("connections_list_accounts", () => {
  it("lists the accounts of the caller's Space", async () => {
    const { call } = setup();
    expect(
      await call(
        "connections_list_accounts",
        { connector_id: "google-gmail" },
        { principalId: MEMBER, spaceId: SPACE }
      )
    ).toEqual({
      accounts: [
        {
          account: "team@example.com",
          connection_id: CONNECTION_ID,
          display_name: null,
        },
      ],
    });
  });

  it("requires a Space", async () => {
    const { call } = setup();
    await expect(
      call(
        "connections_list_accounts",
        { connector_id: "google-gmail" },
        { principalId: MEMBER }
      )
    ).rejects.toMatchObject({ code: "connections.spaceRequired", status: 400 });
  });

  it("refuses a Space the person cannot enter, as if it did not exist", async () => {
    const { call, listCandidateConnections } = setup();
    await expect(
      call(
        "connections_list_accounts",
        { connector_id: "google-gmail", space_id: SPACE },
        { principalId: OUTSIDER }
      )
    ).rejects.toMatchObject({ code: "space_not_found", status: 404 });
    expect(listCandidateConnections).not.toHaveBeenCalled();
  });

  it("keeps an agent to the Space its run is in", async () => {
    const { call } = setup();
    await expect(
      call(
        "connections_list_accounts",
        { connector_id: "google-gmail", space_id: SPACE },
        { principalId: "svc-1", principalType: "service", spaceId: OTHER_SPACE }
      )
    ).rejects.toMatchObject({ code: "connection_not_in_space", status: 403 });
  });
});

describe("connections_update_settings", () => {
  const input = { autonomous_mode: "read_only", connection_id: CONNECTION_ID };

  it("lets an owner of the account's Space change it", async () => {
    const { call, updateConnectionSettings } = setup();
    await call("connections_update_settings", input, { principalId: OWNER });
    expect(updateConnectionSettings).toHaveBeenCalledWith({
      autonomousMode: "read_only",
      connectionId: CONNECTION_ID,
      displayName: undefined,
      tenantId: TENANT,
    });
  });

  it("lets a tenant admin change it", async () => {
    const { call, updateConnectionSettings } = setup();
    await call("connections_update_settings", input, {
      capabilities: ["core.users.manage"],
      principalId: OUTSIDER,
    });
    expect(updateConnectionSettings).toHaveBeenCalled();
  });

  it("refuses a member — even the one who connected it", async () => {
    const { call, updateConnectionSettings } = setup();
    await expect(
      call("connections_update_settings", input, { principalId: MEMBER })
    ).rejects.toMatchObject({
      code: "connection_not_space_owner",
      status: 403,
    });
    expect(updateConnectionSettings).not.toHaveBeenCalled();
  });

  it("answers 404 to someone outside the Space", async () => {
    const { call } = setup();
    await expect(
      call("connections_update_settings", input, { principalId: OUTSIDER })
    ).rejects.toMatchObject({ code: "connection_not_found", status: 404 });
  });
});

describe("connections_approvals_list", () => {
  it("shows an owner the requests on their Space's accounts", async () => {
    const { call } = setup();
    const result = (await call(
      "connections_approvals_list",
      {},
      { principalId: OWNER }
    )) as { requests: ApprovalRequestRecord[] };
    expect(result.requests.map((r) => r.id)).toEqual(["r-1"]);
  });

  it("shows a member none — they cannot decide them", async () => {
    const { call } = setup();
    expect(
      await call("connections_approvals_list", {}, { principalId: MEMBER })
    ).toEqual({ requests: [] });
  });
});
