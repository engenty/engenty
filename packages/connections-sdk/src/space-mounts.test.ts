import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  listMountedConnectionAccess,
  listMountedConnectionIds,
} from "./space-mounts.js";

const TENANT = "11111111-1111-4111-8111-111111111111";
const SPACE = "22222222-2222-4222-8222-222222222222";

/** A client that answers `space_mount` then `connections` (all_spaces). */
function client(options: {
  allSpaces?: Array<{ id: string }>;
  allSpacesError?: { message: string };
  mounts?: Array<{ agent_access: string | null; resource_key: string }>;
  mountsError?: { message: string };
}): SupabaseClient {
  return {
    schema: (schema: string) => ({
      from: (table: string) => {
        const isMounts = schema === "core" && table === "space_mount";
        const result = isMounts
          ? options.mountsError
            ? { error: options.mountsError }
            : { data: options.mounts ?? [] }
          : options.allSpacesError
            ? { error: options.allSpacesError }
            : { data: options.allSpaces ?? [] };
        const builder = {
          eq: () => builder,
          select: () => builder,
          // biome-ignore lint/suspicious/noThenProperty: stands in for a PostgREST builder
          then: (resolve: (value: unknown) => unknown) => resolve(result),
        };
        return builder;
      },
    }),
  } as unknown as SupabaseClient;
}

describe("listMountedConnectionAccess", () => {
  it("reads the level, and keeps an undecided mount as null", async () => {
    const access = await listMountedConnectionAccess(
      client({
        mounts: [
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

  it("unions all-spaces accounts as undecided mounts", async () => {
    const access = await listMountedConnectionAccess(
      client({
        allSpaces: [{ id: "conn-org" }],
        mounts: [{ agent_access: "write", resource_key: "conn-1" }],
      }),
      TENANT,
      SPACE
    );
    expect(access).toEqual(
      new Map([
        ["conn-1", "write"],
        ["conn-org", null],
      ])
    );
  });

  it("answers null on a read failure, so the gate does not narrow", async () => {
    // Failing shut would turn one core hiccup into a dead connector for every
    // space at once; the mount narrows, it does not authorize.
    expect(
      await listMountedConnectionAccess(
        client({ mountsError: { message: "boom" } }),
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
          mounts: [
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
        client({ mountsError: { message: "boom" } }),
        TENANT,
        SPACE
      )
    ).toBeNull();
  });
});
