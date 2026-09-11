import { describe, expect, it } from "vitest";
import { createThreadStore } from "./thread-store.js";

const TENANT = "00000000-0000-4000-8000-000000000001";
const USER = "00000000-0000-4000-8000-000000000002";
const SPACE_A = "019fe8ec-0000-4000-8000-00000000000a";
const SPACE_B = "019fe8ec-0000-4000-8000-00000000000b";

function threadRow(id: string, spaceId: string | null) {
  return {
    agent_id: "engenty.copilot",
    archived_at: null,
    created_at: "2026-08-21T00:00:00.000Z",
    created_by_user_id: USER,
    id,
    metadata: {},
    route_context: {},
    status: "idle",
    summary: null,
    tenant_id: TENANT,
    title: null,
    updated_at: "2026-08-21T00:00:00.000Z",
    space_id: spaceId,
    workspace_key: null,
  };
}

function thenableBuilder(result: { data: unknown; error: null }) {
  const eqs: [string, unknown][] = [];
  const builder: {
    eq: (column: string, value: unknown) => typeof builder;
    in: (...args: unknown[]) => typeof builder;
    is: (...args: unknown[]) => typeof builder;
    limit: (...args: unknown[]) => typeof builder;
    order: (...args: unknown[]) => typeof builder;
    select: (...args: unknown[]) => typeof builder;
    then: (
      resolve: (value: { data: unknown; error: null }) => unknown
    ) => Promise<unknown>;
  } = {
    eq(column, value) {
      eqs.push([column, value]);
      return builder;
    },
    in() {
      return builder;
    },
    is() {
      return builder;
    },
    limit() {
      return builder;
    },
    order() {
      return builder;
    },
    select() {
      return builder;
    },
    // biome-ignore lint/suspicious/noThenProperty: mock of a thenable Supabase query builder
    then(resolve) {
      return Promise.resolve(resolve(result));
    },
  };
  return { builder, eqs };
}

function makeStore(params: {
  participantIds?: string[];
  threads?: ReturnType<typeof threadRow>[];
}) {
  const participant = thenableBuilder({
    data: (params.participantIds ?? ["thread-a", "thread-b"]).map((id) => ({
      thread_id: id,
    })),
    error: null,
  });
  const thread = thenableBuilder({
    data: params.threads ?? [
      threadRow("thread-a", SPACE_A),
      threadRow("thread-b", SPACE_B),
      threadRow("thread-legacy", null),
    ],
    error: null,
  });
  const store = createThreadStore({
    getTenantDb: () =>
      ({
        schema: () => ({
          from: (table: string) =>
            table === "thread_participant"
              ? participant.builder
              : thread.builder,
        }),
      }) as never,
    serviceDb: {} as never,
  });
  return { store, threadEqs: thread.eqs };
}

describe("thread-store space_id isolation", () => {
  it("listThreadsForUser applies .eq(space_id) and does not query tenant-wide", async () => {
    const { store, threadEqs } = makeStore({});
    await store.listThreadsForUser({
      spaceId: SPACE_A,
      tenantId: TENANT,
      userId: USER,
    });
    expect(threadEqs).toContainEqual(["tenant_id", TENANT]);
    expect(threadEqs).toContainEqual(["space_id", SPACE_A]);
    expect(
      threadEqs.some(
        ([column, value]) => column === "space_id" && value === SPACE_B
      )
    ).toBe(false);
  });

  it("omitting spaceId does not add a space_id filter (All spaces)", async () => {
    const { store, threadEqs } = makeStore({});
    await store.listThreadsForUser({ tenantId: TENANT, userId: USER });
    expect(threadEqs.some(([column]) => column === "space_id")).toBe(false);
  });

  it("listThreadsForSpaceAgent is keyed by space_id, not tenant-wide", async () => {
    const { store, threadEqs } = makeStore({
      threads: [threadRow("thread-a", SPACE_A)],
    });
    await store.listThreadsForSpaceAgent({
      agentId: "engenty.copilot",
      spaceId: SPACE_A,
      tenantId: TENANT,
    });
    expect(threadEqs).toContainEqual(["space_id", SPACE_A]);
    expect(threadEqs).toContainEqual(["agent_id", "engenty.copilot"]);
  });
});
