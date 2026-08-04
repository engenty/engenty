// CON-01 regression: an engenty App sending mail with nobody's approval.
//
// The chain the audit traced: an App calls core with the VIEWING USER's token
// (app-proxy-routes mints its capability handle from `caller.accessToken`),
// so this policy saw `principalType === "user"` and returned `null` on an `ask`
// outcome — deferring the approval card to the AI-side pre-gate. Outside chat
// that pre-gate is not running. `executeConnectorAction` then proceeds on
// `ask` + live principal, and the mail is sent. Meanwhile the engenty-bridge
// skill promises the app author a `pending_approval` result.
//
// The fix is not to distrust the user's token — it is to stop conflating
// "user principal" with "a human is watching".

import {
  __resetConnectorRegistryForTests,
  type ConnectionSummary,
  type ConnectionsRepo,
  registerConnectorDefinition,
} from "@engenty/connections-sdk";
import type { PluginPolicyInput } from "@engenty/plugin-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConnectionsProfilePolicy } from "./policy.js";

const TENANT = "t-1";
const USER = "u-1";
const CONNECTION_ID = "conn-1";

const handler = vi.fn(() => Promise.resolve({ ok: true }));

function registerTestConnector(
  overrides: { id?: string; name?: string; toolPrefix?: string } = {}
) {
  registerConnectorDefinition({
    actions: [
      {
        group: "read",
        handler,
        id: "list_messages",
        inputSchema: undefined,
        name: "List messages",
      },
      {
        group: "write",
        handler,
        id: "send_message",
        inputSchema: undefined,
        name: "Send message",
      },
    ],
    auth: { kind: "browser" },
    id: overrides.id ?? "testmail",
    name: overrides.name ?? "Test Mail",
    toolPrefix: overrides.toolPrefix ?? "testmail",
  } as unknown as Parameters<typeof registerConnectorDefinition>[0]);
}

function connection(
  overrides: Partial<ConnectionSummary> = {}
): ConnectionSummary {
  return {
    auth_kind: "browser",
    autonomous_mode: "full",
    connector_id: "testmail",
    created_at: "2026-01-01T00:00:00.000Z",
    display_name: "Test Mail",
    error_message: null,
    external_account: "person@example.com",
    granted_scopes: [],
    id: CONNECTION_ID,
    non_owner_max_group: null,
    owner_user_id: USER,
    sharing: "personal",
    status: "active",
    tenant_id: TENANT,
    ...overrides,
  } as ConnectionSummary;
}

function repo(conn = connection()): ConnectionsRepo {
  return {
    listCandidateConnections: () => Promise.resolve([conn]),
    listPolicyOverrides: () => Promise.resolve([]),
  } as unknown as ConnectionsRepo;
}

function policyInput(overrides: {
  callOrigin?: "app";
  capabilities?: string[];
  operationId?: string;
  principalType?: "user" | "agent" | "service";
}): PluginPolicyInput {
  return {
    auth: {
      audience: [],
      authMethod: "oauth",
      ...(overrides.callOrigin ? { callOrigin: overrides.callOrigin } : {}),
      capabilities: overrides.capabilities ?? ["module.connections.write"],
      delegationChain: [],
      moduleIds: [],
      permissions: [],
      principalId: USER,
      principalType: overrides.principalType ?? "user",
      roleProfiles: [],
      roles: [],
      scopes: [],
      tenantId: TENANT,
      tokenType: "access",
    },
    moduleId: "connections",
    operationId: overrides.operationId ?? "testmail_send_message",
    requiredCapabilities: ["module.connections.write"],
    requiresApproval: false,
    riskLevel: "high",
  } as PluginPolicyInput;
}

describe("connections profile policy — who owns the approval UX", () => {
  beforeEach(() => {
    __resetConnectorRegistryForTests();
    registerTestConnector();
    handler.mockClear();
  });

  afterEach(() => {
    __resetConnectorRegistryForTests();
  });

  it("escalates an App-originated write with the connection it resolved", async () => {
    const policy = createConnectionsProfilePolicy(repo());
    const decision = await policy(
      policyInput({ callOrigin: "app", principalType: "user" })
    );

    expect(decision?.action).toBe("require_approval");
    expect(decision?.reason).toContain("connection_approval_pending");
    // The policy no longer writes a request row of its own; the context it
    // attaches is what core's gate stores so the approvals UI can say which
    // connection the ask resolved to.
    expect(decision?.approvalContext).toEqual({
      action_id: "send_message",
      connection_id: CONNECTION_ID,
      connector_id: "testmail",
    });
    // The gate decides; it must never be the thing that runs the action.
    expect(handler).not.toHaveBeenCalled();
  });

  it("leaves interactive chat behaviour exactly as it was", async () => {
    // Same user, same write, no app origin: `null` hands the approval card to
    // the AI pre-gate, which IS running in chat. Changing this would put two
    // approval prompts in front of every chat connector call.
    const policy = createConnectionsProfilePolicy(repo());
    const decision = await policy(policyInput({ principalType: "user" }));

    expect(decision).toBeNull();
  });

  it("still escalates an agent principal", async () => {
    const policy = createConnectionsProfilePolicy(repo());
    const decision = await policy(policyInput({ principalType: "agent" }));
    expect(decision?.action).toBe("require_approval");
  });

  it("allows an App-originated read — reads were never the hole", async () => {
    const policy = createConnectionsProfilePolicy(repo());
    const decision = await policy(
      policyInput({
        callOrigin: "app",
        operationId: "testmail_list_messages",
      })
    );
    expect(decision?.action).toBe("allow");
  });

  it("denies an App-originated write on a connection with autonomy off", async () => {
    // Treating App calls as autonomous also subjects them to the connection's
    // own autonomous_mode clamp. A connection its owner marked "off" now
    // refuses outright rather than asking.
    const policy = createConnectionsProfilePolicy(
      repo(connection({ autonomous_mode: "off" }))
    );
    const decision = await policy(policyInput({ callOrigin: "app" }));
    expect(decision?.action).toBe("deny");
    expect(decision?.reason).toContain("connection_autonomous_disabled");
  });

  // CON-02 through the authoritative gate, not just the helper. The two
  // connectors are registered together so the only difference between the
  // passing and failing case is which connector the operation id names.
  describe("per-connector write scope", () => {
    beforeEach(() => {
      registerTestConnector({
        id: "testchat",
        name: "Test Chat",
        toolPrefix: "testchat",
      });
    });

    const gmailScoped = [
      "module.connections.read",
      "module.connections.write",
      "module.connections.write.testmail",
    ];

    it("denies a write to a connector the role does not name", async () => {
      const policy = createConnectionsProfilePolicy(
        repo(connection({ connector_id: "testchat" }))
      );
      const decision = await policy(
        policyInput({
          capabilities: gmailScoped,
          operationId: "testchat_send_message",
        })
      );
      expect(decision?.action).toBe("deny");
      expect(decision?.reason).toContain("connection_connector_not_permitted");
      // Denied before any approval escalation or handler is reached.
      expect(handler).not.toHaveBeenCalled();
    });

    it("allows the write to the connector it does name", async () => {
      const policy = createConnectionsProfilePolicy(repo());
      const decision = await policy(
        policyInput({
          capabilities: gmailScoped,
          operationId: "testmail_send_message",
        })
      );
      // `null` = the interactive chat path, i.e. not denied by the scope gate.
      expect(decision).toBeNull();
    });

    it("does not restrict reads on the unnamed connector", async () => {
      const policy = createConnectionsProfilePolicy(
        repo(connection({ connector_id: "testchat" }))
      );
      const decision = await policy(
        policyInput({
          capabilities: gmailScoped,
          operationId: "testchat_list_messages",
        })
      );
      expect(decision?.action).toBe("allow");
    });

    it("leaves an unscoped broad grant able to drive every connector", async () => {
      const policy = createConnectionsProfilePolicy(
        repo(connection({ connector_id: "testchat" }))
      );
      const decision = await policy(
        policyInput({
          capabilities: ["module.connections.read", "module.connections.write"],
          operationId: "testchat_send_message",
        })
      );
      expect(decision).toBeNull();
    });

    it("still denies an App-origin write to an unnamed connector", async () => {
      // The two gates compose: scope refuses first, so CON-01's approval
      // request is never even recorded for a connector the role cannot use.
      const policy = createConnectionsProfilePolicy(
        repo(connection({ connector_id: "testchat" }))
      );
      const decision = await policy(
        policyInput({
          callOrigin: "app",
          capabilities: gmailScoped,
          operationId: "testchat_send_message",
        })
      );
      expect(decision?.action).toBe("deny");
      expect(decision?.approvalContext).toBeUndefined();
    });
  });

  it("abstains on operations that are not connector actions", async () => {
    const policy = createConnectionsProfilePolicy(repo());
    expect(
      await policy(
        policyInput({ callOrigin: "app", operationId: "tasks_create" })
      )
    ).toBeNull();
  });
});
