import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  listMountedConnectionAccess,
  listMountedConnectionIds,
} from "./space-mounts.js";

const TENANT = "11111111-1111-4111-8111-111111111111";
const SPACE = "22222222-2222-4222-8222-222222222222";

/** A client that answers one `space_mount` select and records the filters. */
function client(result: {
  data?: Array<{ agent_access: string | null; resource_key: string }>;
  error?: { message: string };
}): SupabaseClient {
  const builder = {
    eq: () => builder,
    select: () => builder,
    // biome-ignore lint/suspicious/noThenProperty: stands in for a PostgREST builder
    then: (resolve: (value: unknown) => unknown) => resolve(result),
  };
  return {
    schema: () => ({ from: () => builder }),
  } as unknown as SupabaseClient;
}

describe("listMountedConnectionAccess", () => {
  it("reads the level, and keeps an undecided mount as null", async () => {
    const access = await listMountedConnectionAccess(
      client({
        data: [
          { agent_access: "read", resource_key: "conn-1" },
          { agent_access: null, resource_key: "conn-2" },
          { agent_access: "none", resource_key: "conn-3" },
        ],
      }),
      TENANT,
      SPACE
    );
    expect(access).toEqual(
      new Map([
        ["conn-1", "read"],
        // Never decided here — the account's own autonomous_mode decides.
        ["conn-2", null],
        // Decided: available to people, closed to this space's engentys.
        ["conn-3", "none"],
      ])
    );
  });

  it("answers null on a read failure, so the gate does not narrow", async () => {
    // Failing shut would turn one core hiccup into a dead connector for every
    // space at once; the mount narrows, it does not authorize.
    expect(
      await listMountedConnectionAccess(
        client({ error: { message: "boom" } }),
        TENANT,
        SPACE
      )
    ).toBeNull();
  });
});

describe("listMountedConnectionIds", () => {
  it("is the same read as the access map, keys only", async () => {
    expect(
      await listMountedConnectionIds(
        client({
          data: [
            { agent_access: "write", resource_key: "conn-1" },
            { agent_access: null, resource_key: "conn-2" },
          ],
        }),
        TENANT,
        SPACE
      )
    ).toEqual(new Set(["conn-1", "conn-2"]));
  });

  it("passes a read failure through as null", async () => {
    expect(
      await listMountedConnectionIds(
        client({ error: { message: "boom" } }),
        TENANT,
        SPACE
      )
    ).toBeNull();
  });
});
