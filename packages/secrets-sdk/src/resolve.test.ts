import { describe, expect, it, vi } from "vitest";
import {
  canReadSecret,
  type Principal,
  type ResolveDeps,
  type SecretRow,
} from "./resolve.js";

const TENANT = "t1";
const db = {} as never; // canReadSecret never touches the client directly (deps do)

function makeDeps(over: Partial<ResolveDeps> = {}): ResolveDeps {
  return {
    hasSecretGrant: vi.fn(async () => false),
    listGoalGrantCapabilities: vi.fn(async () => []),
    isAssignedToClient: vi.fn(async () => false),
    isProjectMember: vi.fn(async () => false),
    ...over,
  };
}

function secret(over: Partial<SecretRow> = {}): SecretRow {
  return { id: "s1", owner_scope: "client", owner_id: "c1", ...over };
}

const user = (id = "u1"): Principal => ({ kind: "user", id });
const agent = (id = "a1", goalId: string | null = "g1"): Principal => ({
  kind: "agent",
  id,
  goalId,
});

async function can(
  principal: Principal,
  s: SecretRow,
  deps: ResolveDeps
): Promise<boolean> {
  return canReadSecret(db, { tenantId: TENANT, principal, secret: s }, deps);
}

describe("canReadSecret — explicit grant (either principal kind)", () => {
  it("a direct secret grant beats every scope rule", async () => {
    const deps = makeDeps({ hasSecretGrant: vi.fn(async () => true) });
    // owner mismatch + no memberships, yet the grant allows it
    expect(
      await can(
        user("nobody"),
        secret({ owner_scope: "user", owner_id: "someone" }),
        deps
      )
    ).toBe(true);
    expect(await can(agent("a9", null), secret(), deps)).toBe(true);
  });
});

describe("canReadSecret — user × owner_scope truth table", () => {
  it("user scope: only the owner", async () => {
    const s = secret({ owner_scope: "user", owner_id: "u1" });
    expect(await can(user("u1"), s, makeDeps())).toBe(true);
    expect(await can(user("u2"), s, makeDeps())).toBe(false);
  });

  it("tenant scope: any in-tenant user (route already checked the feature cap)", async () => {
    const s = secret({ owner_scope: "tenant", owner_id: TENANT });
    expect(await can(user("anyone"), s, makeDeps())).toBe(true);
  });

  it("client scope: iff assigned to the client (via project membership)", async () => {
    const s = secret({ owner_scope: "client", owner_id: "c1" });
    expect(
      await can(
        user(),
        s,
        makeDeps({ isAssignedToClient: vi.fn(async () => true) })
      )
    ).toBe(true);
    expect(
      await can(
        user(),
        s,
        makeDeps({ isAssignedToClient: vi.fn(async () => false) })
      )
    ).toBe(false);
  });

  it("project scope: iff a member of that project", async () => {
    const s = secret({ owner_scope: "project", owner_id: "p1" });
    expect(
      await can(
        user(),
        s,
        makeDeps({ isProjectMember: vi.fn(async () => true) })
      )
    ).toBe(true);
    expect(
      await can(
        user(),
        s,
        makeDeps({ isProjectMember: vi.fn(async () => false) })
      )
    ).toBe(false);
  });

  it("client-scope check queries the client, not the project, source", async () => {
    const isAssignedToClient = vi.fn(async () => true);
    const isProjectMember = vi.fn(async () => true);
    await can(
      user("u1"),
      secret({ owner_scope: "client", owner_id: "c7" }),
      makeDeps({ isAssignedToClient, isProjectMember })
    );
    expect(isAssignedToClient).toHaveBeenCalledWith("u1", "c7");
    expect(isProjectMember).not.toHaveBeenCalled();
  });
});

describe("canReadSecret — agent path (no scope fallthrough)", () => {
  it("allows exactly the secret named in a goal grant", async () => {
    const deps = makeDeps({
      listGoalGrantCapabilities: vi.fn(async () => ["secrets.read:s1"]),
    });
    expect(await can(agent("a1", "g1"), secret({ id: "s1" }), deps)).toBe(true);
    // a grant for s1 does not unlock s2
    expect(await can(agent("a1", "g1"), secret({ id: "s2" }), deps)).toBe(
      false
    );
  });

  it("denies an agent that only has scope membership (agents never inherit scope)", async () => {
    // Even though the client/project deps would say yes for a user, an agent
    // with no grant and no goal cap is denied.
    const deps = makeDeps({
      isAssignedToClient: vi.fn(async () => true),
      isProjectMember: vi.fn(async () => true),
    });
    expect(
      await can(
        agent("a1", "g1"),
        secret({ owner_scope: "client", owner_id: "c1" }),
        deps
      )
    ).toBe(false);
    expect(
      await can(
        agent("a1", "g1"),
        secret({ owner_scope: "project", owner_id: "p1" }),
        deps
      )
    ).toBe(false);
    expect(
      await can(
        agent("a1", "g1"),
        secret({ owner_scope: "tenant", owner_id: TENANT }),
        deps
      )
    ).toBe(false);
  });

  it("no goal id ⇒ no goal-grant lookup ⇒ denied without a direct grant", async () => {
    const listGoalGrantCapabilities = vi.fn(async () => ["secrets.read:s1"]);
    const deps = makeDeps({ listGoalGrantCapabilities });
    expect(await can(agent("a1", null), secret({ id: "s1" }), deps)).toBe(
      false
    );
    expect(listGoalGrantCapabilities).not.toHaveBeenCalled();
  });

  it("goal-grant lookup is scoped to (tenant, goal, agent)", async () => {
    const listGoalGrantCapabilities = vi.fn(async () => []);
    await can(
      agent("a1", "g1"),
      secret({ id: "s1" }),
      makeDeps({ listGoalGrantCapabilities })
    );
    expect(listGoalGrantCapabilities).toHaveBeenCalledWith(TENANT, "g1", "a1");
  });
});
