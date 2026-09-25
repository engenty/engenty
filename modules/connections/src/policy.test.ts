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
const SPACE = "00000000-0000-4000-8000-00000000aaaa";

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
    connected_by: USER,
    connector_id: "testmail",
    created_at: "2026-01-01T00:00:00.000Z",
    display_name: "Test Mail",
    error_message: null,
    external_account: "person@example.com",
    granted_scopes: [],
    id: CONNECTION_ID,
    space_id: SPACE,
    status: "active",
    tenant_id: TENANT,
    ...overrides,
  } as ConnectionSummary;
}

/**
 * Tenant-locked repo factory, as the Phase A policy signature expects. Like
 * the real repo, candidates are the accounts the named Space owns.
 */
function repo(...conns: ConnectionSummary[]): () => ConnectionsRepo {
  const all = conns.length > 0 ? conns : [connection()];
  const stub = {
    listCandidateConnections: (params: { spaceId: string }) =>
      Promise.resolve(all.filter((c) => c.space_id === params.spaceId)),
    listPolicyOverrides: () => Promise.resolve([]),
  } as unknown as ConnectionsRepo;
  return () => stub;
}

function policyInput(overrides: {
  callOrigin?: "app";
  capabilities?: string[];
  operationId?: string;
  principalId?: string;
  principalType?: "user" | "agent" | "service";
  /** Defaults to the Space that owns the test account; null = no Space. */
  spaceId?: string | null;
}): PluginPolicyInput {
  const spaceId = overrides.spaceId === undefined ? SPACE : overrides.spaceId;
  return {
    auth: {
      audience: [],
      authMethod: "oauth",
      ...(overrides.callOrigin ? { callOrigin: overrides.callOrigin } : {}),
      ...(spaceId ? { spaceId } : {}),
      capabilities: overrides.capabilities ?? ["module.connections.write"],
      delegationChain: [],
      moduleIds: [],
      permissions: [],
      principalId: overrides.principalId ?? USER,
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

/** The Space claim check, passing: these tests are about what happens inside a Space. */
const allowSpace = async () => true;

describe("connections profile policy — who owns the approval UX", () => {
  beforeEach(() => {
    __resetConnectorRegistryForTests();
    registerTestConnector();
    handler.mockClear();
  });

  afterEach(() => {
    __resetConnectorRegistryForTests();
  });

  it("refuses a Space the call may not use, before reading any account", async () => {
    const policy = createConnectionsProfilePolicy(repo(), async () => false);
    const decision = await policy(
      policyInput({ callOrigin: "app", principalType: "user" })
    );
    expect(decision).toMatchObject({ action: "deny" });
    expect(decision && "reason" in decision ? decision.reason : "").toContain(
      "connection_not_in_space"
    );
  });

  it("escalates an App-originated write with the connection it resolved", async () => {
    const policy = createConnectionsProfilePolicy(repo(), allowSpace);
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
      // Who may DECIDE this: core restricts the decision route to the owners
      // of this Space (plus tenant admins) on the strength of this field.
      space_id: SPACE,
      connector_id: "testmail",
    });
    expect(decision?.reason).toContain(
      "sent to the owners of the connection's space"
    );
    // The gate decides; it must never be the thing that runs the action.
    expect(handler).not.toHaveBeenCalled();
  });

  it("leaves interactive chat behaviour exactly as it was", async () => {
    // Same user, same write, no app origin: `null` hands the approval card to
    // the AI pre-gate, which IS running in chat. Changing this would put two
    // approval prompts in front of every chat connector call.
    const policy = createConnectionsProfilePolicy(repo(), allowSpace);
    const decision = await policy(policyInput({ principalType: "user" }));

    expect(decision).toBeNull();
  });

  it("still escalates an agent principal", async () => {
    const policy = createConnectionsProfilePolicy(repo(), allowSpace);
    const decision = await policy(policyInput({ principalType: "agent" }));
    expect(decision?.action).toBe("require_approval");
  });

  it("allows an App-originated read — reads were never the hole", async () => {
    const policy = createConnectionsProfilePolicy(repo(), allowSpace);
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
      repo(connection({ autonomous_mode: "off" })),
      allowSpace
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
        repo(connection({ connector_id: "testchat" })),
        allowSpace
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
      const policy = createConnectionsProfilePolicy(repo(), allowSpace);
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
        repo(connection({ connector_id: "testchat" })),
        allowSpace
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
        repo(connection({ connector_id: "testchat" })),
        allowSpace
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
        repo(connection({ connector_id: "testchat" })),
        allowSpace
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

  // PLAN-space-owned-connections.md — an account belongs to one Space; every
  // agent and member of that Space uses it, nobody outside it does.
  describe("the run's Space owns the account", () => {
    const SPACE_B = "00000000-0000-4000-8000-00000000bbbb";
    const CONNECTION_B = "conn-2";
    const accountB = connection({
      external_account: "team@example.com",
      id: CONNECTION_B,
      space_id: SPACE_B,
    });

    function asAgent(spaceId: string | null): PluginPolicyInput {
      return policyInput({
        operationId: "testmail_list_messages",
        principalType: "service",
        spaceId,
      });
    }

    it("resolves to the account its own Space owns, not the other Space's", async () => {
      const policy = createConnectionsProfilePolicy(
        repo(connection(), accountB),
        allowSpace
      );
      // Two accounts of the same connector would be ambiguous tenant-wide;
      // each Space sees exactly its own.
      expect(await policy(asAgent(SPACE))).toEqual({
        action: "allow",
        reason: "connection_policy_allow",
      });
      expect(await policy(asAgent(SPACE_B))).toEqual({
        action: "allow",
        reason: "connection_policy_allow",
      });
    });

    it("does not reach another Space's account", async () => {
      const policy = createConnectionsProfilePolicy(repo(accountB), allowSpace);
      const decision = await policy(asAgent(SPACE));
      expect(decision?.action).toBe("deny");
      expect(decision?.reason).toContain("connection_not_connected");
    });

    it("denies with connection_not_in_space when the run names no Space", async () => {
      const policy = createConnectionsProfilePolicy(repo(), allowSpace);
      for (const principalType of ["user", "service"] as const) {
        const decision = await policy(
          policyInput({
            operationId: "testmail_list_messages",
            principalType,
            spaceId: null,
          })
        );
        expect(decision?.action).toBe("deny");
        expect(decision?.reason).toContain("connection_not_in_space");
        expect(decision?.reason).toContain("belong to a space");
      }
    });

    it("clamps an unattended run by the account's autonomous_mode only", async () => {
      const policy = createConnectionsProfilePolicy(
        repo(connection({ autonomous_mode: "read_only" })),
        allowSpace
      );
      const write = await policy(
        policyInput({
          operationId: "testmail_send_message",
          principalType: "agent",
        })
      );
      expect(write?.action).toBe("deny");
      expect(write?.reason).toContain("connection_autonomous_read_only");
      const read = await policy(asAgent(SPACE));
      expect(read?.action).toBe("allow");
    });

    it("does not care who connected the account", async () => {
      // `connected_by` is audit only: a colleague's sign-in serves the whole
      // Space, and a person who connected elsewhere gets nothing here.
      const policy = createConnectionsProfilePolicy(
        repo(connection({ connected_by: "someone-else" })),
        allowSpace
      );
      expect((await policy(asAgent(SPACE)))?.action).toBe("allow");
    });
  });

  it("abstains on operations that are not connector actions", async () => {
    const policy = createConnectionsProfilePolicy(repo(), allowSpace);
    expect(
      await policy(
        policyInput({ callOrigin: "app", operationId: "tasks_create" })
      )
    ).toBeNull();
  });
});
