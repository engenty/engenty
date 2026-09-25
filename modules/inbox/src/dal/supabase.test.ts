import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createInboxRepoSupabase } from "./supabase.js";

const TENANT = "11111111-1111-4111-8111-111111111111";
const SPACE_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SPACE_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

/** Records the filters a read applies, and the args an RPC is called with. */
function recordingClient() {
  const calls = {
    in: [] as { column: string; values: string[] }[],
    rpc: [] as Record<string, unknown>[],
  };
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "or", "order", "limit"]) {
    builder[method] = () => builder;
  }
  builder.in = (column: string, values: string[]) => {
    calls.in.push({ column, values });
    return builder;
  };
  builder.maybeSingle = () => Promise.resolve({ data: null, error: null });
  // Intentionally thenable: awaiting a PostgREST query IS awaiting the builder,
  // so a stand-in has to be one too.
  // biome-ignore lint/suspicious/noThenProperty: stands in for a PostgREST builder
  builder.then = (resolve: (value: unknown) => unknown) =>
    resolve({ data: [], error: null });

  const client = {
    schema: () => ({
      from: () => builder,
      rpc: (_name: string, args: Record<string, unknown>) => {
        calls.rpc.push(args);
        return Promise.resolve({
          data: { threads: [], total: 0 },
          error: null,
        });
      },
    }),
  } as unknown as SupabaseClient;
  return { calls, client };
}

function repo(client: SupabaseClient, spaceIds: ReadonlySet<string> | null) {
  return createInboxRepoSupabase(client, TENANT, "default", { spaceIds });
}

describe("inbox repo space narrowing", () => {
  it("does not narrow the service (sync, bind)", async () => {
    const { calls, client } = recordingClient();
    await repo(client, null).threads.listPaginated({});
    await repo(client, null).threads.getById("thread-1");

    expect(calls.rpc[0].p_space_ids).toBeNull();
    expect(calls.in).toHaveLength(0);
  });

  it("narrows list and read to the caller's Spaces", async () => {
    const { calls, client } = recordingClient();
    const spaces = new Set([SPACE_A, SPACE_B]);
    await repo(client, spaces).threads.listPaginated({});
    await repo(client, spaces).threads.getById("thread-1");

    // Filtered in SQL, so paging and `total` describe the same rows.
    expect(calls.rpc[0].p_space_ids).toEqual([SPACE_A, SPACE_B]);
    expect(calls.in).toEqual([
      { column: "space_id", values: [SPACE_A, SPACE_B] },
    ]);
  });

  it("answers nothing for a caller in no Space", async () => {
    const { calls, client } = recordingClient();
    // The empty set is a decision, not an absence: falling back to the
    // tenant's mail here is exactly the leak this narrowing exists to close.
    await repo(client, new Set()).threads.listPaginated({});

    expect(calls.rpc[0].p_space_ids).toEqual([]);
  });

  it("drops a space key that is not a uuid", async () => {
    const { calls, client } = recordingClient();
    // A non-uuid in a uuid[] would fail the whole query rather than narrow it.
    await repo(client, new Set(["personal", SPACE_A])).threads.getById(
      "thread-1"
    );

    expect(calls.in).toEqual([{ column: "space_id", values: [SPACE_A] }]);
  });
});
