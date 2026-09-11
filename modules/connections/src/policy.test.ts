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
  type SpaceConnectionAccess,
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

/** Tenant-locked repo factory, as the Phase A policy signature expects. */
function repo(conn = connection()): () => ConnectionsRepo {
  const stub = {
    listCandidateConnections: () => Promise.resolve([conn]),
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
  spaceId?: string;
  triggerId?: string;
}): PluginPolicyInput {
  return {
    auth: {
      audience: [],
      authMethod: "oauth",
      ...(overrides.callOrigin ? { callOrigin: overrides.callOrigin } : {}),
      ...(overrides.spaceId ? { spaceId: overrides.spaceId } : {}),
      ...(overrides.triggerId ? { triggerId: overrides.triggerId } : {}),
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
      // CN.6/3 — who may DECIDE this. Core restricts the decision route to the
      // owner (plus tenant admins) on the strength of this field; without it
      // any colleague in the tenant could approve an agent sending mail from
      // someone else's mailbox, which the reason string below already claimed
      // was not possible.
      owner_user_id: USER,
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

  // PLAN-spaces.md Phase CN.3 — the WHERE axis. Two spaces, two mailboxes of
  // the SAME connector: before CN.3 the mount key was the connector, so
  // mounting "Test Mail" in either space reached both accounts.
  describe("space mounts narrow to the ACCOUNT", () => {
    const SPACE_A = "space-a";
    const SPACE_B = "space-b";
    const CONNECTION_B = "conn-2";

    /** Both accounts are candidates for the principal; only mounts differ. */
    function twoAccountRepo(): () => ConnectionsRepo {
      const stub = {
        listCandidateConnections: () =>
          Promise.resolve([
            connection({ sharing: "org" }),
            connection({
              external_account: "team@example.com",
              id: CONNECTION_B,
              sharing: "org",
            }),
          ]),
        listPolicyOverrides: () => Promise.resolve([]),
      } as unknown as ConnectionsRepo;
      return () => stub;
    }

    /** Space A mounts account 1; space B mounts account 2. No level chosen. */
    const mounts = (params: { spaceId: string }) =>
      Promise.resolve(
        new Map<string, SpaceConnectionAccess | null>([
          [params.spaceId === SPACE_A ? CONNECTION_ID : CONNECTION_B, null],
        ])
      );

    function inSpace(spaceId: string): PluginPolicyInput {
      const base = policyInput({ operationId: "testmail_list_messages" });
      return { ...base, auth: { ...base.auth, spaceId } };
    }

    it("resolves to the account its own space mounts", async () => {
      const policy = createConnectionsProfilePolicy(twoAccountRepo(), mounts);
      // Two candidates would be ambiguous without the mount; narrowing to one
      // is what lets the call resolve at all.
      const decision = await policy(inSpace(SPACE_A));
      expect(decision?.reason).not.toContain("connection_not_in_space");
    });

    it("refuses an account mounted only in ANOTHER space, and says so", async () => {
      const policy = createConnectionsProfilePolicy(
        // Only account 2 exists as a candidate, and space A does not mount it.
        (() => {
          const stub = {
            listCandidateConnections: () =>
              Promise.resolve([
                connection({ id: CONNECTION_B, sharing: "org" }),
              ]),
            listPolicyOverrides: () => Promise.resolve([]),
          } as unknown as ConnectionsRepo;
          return () => stub;
        })(),
        mounts
      );
      const decision = await policy(inSpace(SPACE_A));
      expect(decision?.action).toBe("deny");
      // The refusal must name the SPACE, not read as "no such account" — C3a's
      // lesson about silent narrowing producing a confident wrong diagnosis.
      expect(decision?.reason).toContain("connection_not_in_space");
      expect(decision?.reason).toContain("this space");
    });

    // PLAN-connections-ux.md B1 — the mount now carries HOW FAR, not just
    // whether the account is here at all.
    it("clamps an unattended run to the level the space chose", async () => {
      const readOnlyHere = () =>
        Promise.resolve(
          new Map<string, SpaceConnectionAccess | null>([
            [CONNECTION_ID, "read"],
          ])
        );
      const policy = createConnectionsProfilePolicy(repo(), readOnlyHere);
      const base = policyInput({
        operationId: "testmail_send_message",
        principalType: "agent",
      });
      const decision = await policy({
        ...base,
        auth: { ...base.auth, spaceId: SPACE_A },
      });
      expect(decision?.action).toBe("deny");
      expect(decision?.reason).toContain("connection_space_access_read_only");
    });

    it("does not narrow when the call names no space", async () => {
      const policy = createConnectionsProfilePolicy(repo(), mounts);
      const decision = await policy(
        policyInput({ operationId: "testmail_list_messages" })
      );
      expect(decision?.reason ?? "").not.toContain("connection_not_in_space");
    });
  });

  // PLAN-spaces.md CN.5 — "the Marketing Agent may use my Gmail". The
  // alternative was impersonation; a grant keeps the audit trail honest and
  // gives revocation one place to live.
  describe("agent grants on a personal account", () => {
    const AGENT = "agent-1";
    const OTHER_USER = "u-2";

    /** A personal account owned by SOMEONE ELSE — the case grants exist for. */
    function othersPersonalRepo(granted: boolean): () => ConnectionsRepo {
      const conn = connection({ owner_user_id: OTHER_USER });
      const grants = new Set(granted ? [CONNECTION_ID] : []);
      const stub = {
        listAgentGrantedConnectionIds: () => Promise.resolve(grants),
        listCandidateConnections: (params: {
          agentGrantedConnectionIds?: ReadonlySet<string>;
        }) =>
          Promise.resolve(
            params.agentGrantedConnectionIds?.has(conn.id) ? [conn] : []
          ),
        listPolicyOverrides: () => Promise.resolve([]),
      } as unknown as ConnectionsRepo;
      return () => stub;
    }

    function asAgent(): PluginPolicyInput {
      const base = policyInput({
        operationId: "testmail_list_messages",
        principalType: "service",
      });
      return { ...base, auth: { ...base.auth, agentId: AGENT } };
    }

    it("lets a granted agent reach an account it does not own", async () => {
      const policy = createConnectionsProfilePolicy(othersPersonalRepo(true));
      const decision = await policy(asAgent());
      expect(decision?.reason ?? "").not.toContain(
        "connection_personal_not_owner"
      );
    });

    it("denies the same agent without the grant — default is none", async () => {
      const policy = createConnectionsProfilePolicy(othersPersonalRepo(false));
      const decision = await policy(asAgent());
      // No candidate at all: an ungranted personal account of someone else is
      // not merely refused, it is not visible to select from.
      expect(decision?.action).toBe("deny");
    });

    it("does not let a grant override autonomous_mode: off", async () => {
      const conn = connection({
        autonomous_mode: "off",
        owner_user_id: OTHER_USER,
      });
      const stub = {
        listAgentGrantedConnectionIds: () =>
          Promise.resolve(new Set([CONNECTION_ID])),
        listCandidateConnections: () => Promise.resolve([conn]),
        listPolicyOverrides: () => Promise.resolve([]),
      } as unknown as ConnectionsRepo;
      const policy = createConnectionsProfilePolicy(() => stub);
      const decision = await policy(asAgent());
      // The grant answers "may this agent reach the account", not "may it do
      // anything with it" — every other clamp still runs.
      expect(decision?.action).toBe("deny");
      expect(decision?.reason).toContain("connection_autonomous_disabled");
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

describe("personal-space owner resolution (§2.1)", () => {
  beforeEach(() => {
    __resetConnectorRegistryForTests();
    registerTestConnector();
    handler.mockClear();
  });

  afterEach(() => {
    __resetConnectorRegistryForTests();
  });

  const SPACE = "00000000-0000-4000-8000-00000000aaaa";
  const TRIGGER = "00000000-0000-4000-8000-00000000bbbb";

  it("denies a headless run on a personal account without the hook", async () => {
    const policy = createConnectionsProfilePolicy(repo());
    const decision = await policy(
      policyInput({ principalId: "svc-1", principalType: "service" })
    );
    expect(decision?.action).toBe("deny");
    expect(decision?.reason).toContain("connection_personal_not_owner");
  });

  it("lets a verified owner-bound run reach the owner's account — asks stay", async () => {
    // The hook says the run acts for the account's owner; the sharing clamp
    // opens, and the WRITE still lands on the approval lane like any
    // unattended ask — owner reach is not approval reach.
    const seen: unknown[] = [];
    const policy = createConnectionsProfilePolicy(
      repo(),
      undefined,
      (params) => {
        seen.push(params);
        return Promise.resolve(USER);
      }
    );
    const decision = await policy(
      policyInput({
        principalId: "svc-1",
        principalType: "service",
        spaceId: SPACE,
        triggerId: TRIGGER,
      })
    );
    expect(seen).toEqual([
      {
        principalType: "service",
        spaceId: SPACE,
        tenantId: TENANT,
        triggerId: TRIGGER,
      },
    ]);
    expect(decision?.action).toBe("require_approval");
    expect(decision?.reason).toContain("connection_approval_pending");
  });

  it("reads freely when the owner's ceiling allows it", async () => {
    const policy = createConnectionsProfilePolicy(repo(), undefined, () =>
      Promise.resolve(USER)
    );
    const decision = await policy(
      policyInput({
        operationId: "testmail_list_messages",
        principalId: "svc-1",
        principalType: "service",
        spaceId: SPACE,
        triggerId: TRIGGER,
      })
    );
    expect(decision?.action).toBe("allow");
  });

  it("stays denied when the hook cannot verify (returns null)", async () => {
    const policy = createConnectionsProfilePolicy(repo(), undefined, () =>
      Promise.resolve(null)
    );
    const decision = await policy(
      policyInput({
        principalId: "svc-1",
        principalType: "service",
        spaceId: SPACE,
        triggerId: TRIGGER,
      })
    );
    expect(decision?.action).toBe("deny");
    expect(decision?.reason).toContain("connection_personal_not_owner");
  });
});
