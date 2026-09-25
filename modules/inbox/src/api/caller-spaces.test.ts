import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { resolveCallerSpaceIds } from "./caller-spaces.js";

/** core.spaces → owned rows, core.space_member → membership rows. */
function membershipDb(rows: { member: string[]; owned: string[] }) {
  return {
    schema: () => ({
      from: (table: string) => {
        const result =
          table === "spaces"
            ? { data: rows.owned.map((id) => ({ id })), error: null }
            : {
                data: rows.member.map((space_id) => ({ space_id })),
                error: null,
              };
        const builder: Record<string, unknown> = {};
        for (const method of ["select", "eq", "is"]) {
          builder[method] = () => builder;
        }
        // biome-ignore lint/suspicious/noThenProperty: stands in for a PostgREST builder
        builder.then = (resolve: (value: unknown) => unknown) =>
          resolve(result);
        return builder;
      },
    }),
  } as unknown as SupabaseClient;
}

const db = membershipDb({ member: ["space-team"], owned: ["space-me"] });

describe("resolveCallerSpaceIds", () => {
  it("gives a person every Space they own or belong to", async () => {
    const spaces = await resolveCallerSpaceIds(db, {
      principalId: "user-1",
      scopeId: "default",
      tenantId: "t1",
    });
    expect([...spaces].sort()).toEqual(["space-me", "space-team"]);
  });

  it("narrows a person to the named Space they belong to", async () => {
    const spaces = await resolveCallerSpaceIds(db, {
      principalId: "user-1",
      scopeId: "default",
      spaceId: "space-team",
      tenantId: "t1",
    });
    expect([...spaces]).toEqual(["space-team"]);
  });

  it("never widens a person past membership", async () => {
    const spaces = await resolveCallerSpaceIds(db, {
      principalId: "user-1",
      scopeId: "default",
      spaceId: "space-other",
      tenantId: "t1",
    });
    expect(spaces.size).toBe(0);
  });

  it("gives an agent its run's Space, and none without one", async () => {
    const bound = await resolveCallerSpaceIds(db, {
      principalId: "agent-1",
      principalType: "agent",
      scopeId: "default",
      spaceId: "space-team",
      tenantId: "t1",
    });
    expect([...bound]).toEqual(["space-team"]);

    const unbound = await resolveCallerSpaceIds(db, {
      principalId: "agent-1",
      principalType: "agent",
      scopeId: "default",
      tenantId: "t1",
    });
    expect(unbound.size).toBe(0);
  });
});
