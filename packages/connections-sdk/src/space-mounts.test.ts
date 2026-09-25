import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  canEnterSpace,
  listMountedPluginIds,
  readSpaceAccess,
  resolveSpaceRecordAccounts,
} from "./space-mounts.js";

const TENANT = "11111111-1111-4111-8111-111111111111";
const SPACE = "22222222-2222-4222-8222-222222222222";

interface Call {
  eq: [string, unknown][];
  schema: string;
  table: string;
}

/** A client that answers every read with `result` and records the filters. */
function client(
  result: { data?: unknown[]; error?: { message: string } },
  calls: Call[] = []
): SupabaseClient {
  return {
    schema: (schema: string) => ({
      from: (table: string) => {
        const call: Call = { eq: [], schema, table };
        calls.push(call);
        const builder = {
          eq: (column: string, value: unknown) => {
            call.eq.push([column, value]);
            return builder;
          },
          select: () => builder,
          // biome-ignore lint/suspicious/noThenProperty: stands in for a PostgREST builder
          then: (resolve: (value: unknown) => unknown) => resolve(result),
        };
        return builder;
      },
    }),
  } as unknown as SupabaseClient;
}

describe("listMountedPluginIds", () => {
  it("reads the plugin mounts of the Space", async () => {
    const calls: Call[] = [];
    expect(
      await listMountedPluginIds(
        client({ data: [{ resource_key: "google-gmail" }] }, calls),
        TENANT,
        SPACE
      )
    ).toEqual(new Set(["google-gmail"]));
    expect(calls[0]?.eq).toContainEqual(["resource_type", "plugin"]);
  });

  it("answers null on a read failure", async () => {
    expect(
      await listMountedPluginIds(
        client({ error: { message: "boom" } }),
        TENANT,
        SPACE
      )
    ).toBeNull();
  });
});

describe("resolveSpaceRecordAccounts", () => {
  it("does not narrow when no Space is named", async () => {
    expect(
      await resolveSpaceRecordAccounts(client({ data: [] }), {
        spaceId: null,
        tenantId: TENANT,
      })
    ).toBeNull();
  });

  it("answers the accounts the Space owns", async () => {
    const calls: Call[] = [];
    expect(
      await resolveSpaceRecordAccounts(
        client({ data: [{ id: "conn-1" }, { id: "conn-2" }] }, calls),
        { spaceId: SPACE, tenantId: TENANT }
      )
    ).toEqual(new Set(["conn-1", "conn-2"]));
    expect(calls[0]).toMatchObject({
      schema: "module_connections",
      table: "connections",
    });
    expect(calls[0]?.eq).toContainEqual(["space_id", SPACE]);
  });

  it("answers an empty set for a Space without accounts", async () => {
    expect(
      await resolveSpaceRecordAccounts(client({ data: [] }), {
        spaceId: SPACE,
        tenantId: TENANT,
      })
    ).toEqual(new Set());
  });

  it("throws on a read failure rather than widening to the tenant", async () => {
    await expect(
      resolveSpaceRecordAccounts(client({ error: { message: "boom" } }), {
        spaceId: SPACE,
        tenantId: TENANT,
      })
    ).rejects.toThrow("space accounts: boom");
  });
});

/** Answers `core.spaces` and `core.space_member` from fixed rows. */
function spacesClient(tables: {
  space_member: Array<{ role: string; space_id: string }>;
  spaces: Array<{
    id: string;
    owner_user_id: string | null;
    visibility: string;
  }>;
}): SupabaseClient {
  return {
    schema: () => ({
      from: (table: "space_member" | "spaces") => {
        const builder = {
          eq: () => builder,
          is: () => builder,
          select: () => builder,
          // biome-ignore lint/suspicious/noThenProperty: stands in for a PostgREST builder
          then: (resolve: (value: unknown) => unknown) =>
            resolve({ data: tables[table] }),
        };
        return builder;
      },
    }),
  } as unknown as SupabaseClient;
}

describe("readSpaceAccess", () => {
  const client = spacesClient({
    space_member: [
      { role: "owner", space_id: "team-owned" },
      { role: "member", space_id: "team-member" },
    ],
    spaces: [
      { id: "personal", owner_user_id: "u-1", visibility: "private" },
      { id: "someone-else", owner_user_id: "u-2", visibility: "private" },
      { id: "team-owned", owner_user_id: null, visibility: "private" },
      { id: "team-member", owner_user_id: null, visibility: "private" },
      { id: "team-private", owner_user_id: null, visibility: "private" },
      { id: "company", owner_user_id: null, visibility: "open" },
    ],
  });

  it("mirrors core's enter rule and marks the Spaces the user owns", async () => {
    expect(
      await readSpaceAccess(client, { tenantId: TENANT, userId: "u-1" })
    ).toEqual(
      new Map([
        ["personal", { isOwner: true }],
        ["team-owned", { isOwner: true }],
        ["team-member", { isOwner: false }],
        ["company", { isOwner: false }],
      ])
    );
  });

  it("lets a tenant admin enter any Space, and nobody else a foreign one", async () => {
    const params = { spaceId: "someone-else", tenantId: TENANT, userId: "u-1" };
    expect(await canEnterSpace(client, params)).toBe(false);
    expect(
      await canEnterSpace(client, {
        ...params,
        capabilities: ["core.users.manage"],
      })
    ).toBe(true);
    expect(
      await canEnterSpace(client, { ...params, spaceId: "team-member" })
    ).toBe(true);
  });
});
