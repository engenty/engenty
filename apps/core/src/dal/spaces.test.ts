/**
 * Space mark/restore guards — the Company space and personal spaces must not
 * be deletable, and a second mark is a no-op.
 */
import { describe, expect, it, vi } from "vitest";
import { markSpaceDeleted, restoreSpace, type SpaceRow } from "./spaces.js";

const TENANT = "11111111-1111-1111-1111-111111111111";
const SPACE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function row(
  partial: Partial<SpaceRow> & Pick<SpaceRow, "id" | "key">
): SpaceRow {
  return {
    agent_approval_mode: null,
    color: null,
    computer_network_tier: null,
    created_at: "2026-09-07T00:00:00.000Z",
    deleted_at: null,
    icon: null,
    is_default: false,
    name: partial.key,
    owner_user_id: null,
    purge_after: null,
    tenant_id: TENANT,
    visibility: "open",
    ...partial,
  };
}

function stubClient(store: { current: SpaceRow | null }) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  Object.assign(builder, {
    eq: chain,
    ilike: chain,
    is: chain,
    maybeSingle: () => Promise.resolve({ data: store.current, error: null }),
    not: chain,
    select: chain,
    single: () => Promise.resolve({ data: store.current, error: null }),
    update: (patch: Record<string, unknown>) => {
      if (store.current) {
        store.current = { ...store.current, ...patch };
      }
      return builder;
    },
  });
  return {
    schema: () => ({
      from: () => ({
        select: chain,
        update: builder.update,
      }),
    }),
  } as never;
}

describe("markSpaceDeleted", () => {
  it("refuses the Company space", async () => {
    const store = {
      current: row({ id: SPACE, is_default: true, key: "company" }),
    };
    await expect(
      markSpaceDeleted(stubClient(store), TENANT, SPACE)
    ).rejects.toThrow("space_is_default");
  });

  it("refuses a personal space", async () => {
    const store = {
      current: row({
        id: SPACE,
        key: "alice",
        owner_user_id: OWNER,
        visibility: "private",
      }),
    };
    await expect(
      markSpaceDeleted(stubClient(store), TENANT, SPACE)
    ).rejects.toThrow("space_is_personal");
  });

  it("is a no-op when the space is already marked", async () => {
    const marked = row({
      deleted_at: "2026-09-07T12:00:00.000Z",
      id: SPACE,
      key: "vault",
      purge_after: "2026-09-14T12:00:00.000Z",
    });
    const store = { current: marked };
    const result = await markSpaceDeleted(stubClient(store), TENANT, SPACE);
    expect(result.deletedAt).toBe(marked.deleted_at);
  });
});

describe("restoreSpace", () => {
  it("clears the mark on a pending space", async () => {
    const store = {
      current: row({
        deleted_at: "2026-09-07T12:00:00.000Z",
        id: SPACE,
        key: "vault",
        purge_after: "2026-09-14T12:00:00.000Z",
      }),
    };
    const result = await restoreSpace(stubClient(store), TENANT, SPACE);
    expect(result.deletedAt).toBeNull();
    expect(result.purgeAfter).toBeNull();
  });
});

describe("resolveSpacePurgeAfter", () => {
  it("defaults to seven days", async () => {
    const { resolveSpacePurgeAfter } = await import("./spaces.js");
    vi.stubEnv("ENGENTY_SPACE_PURGE_AFTER_DAYS", "");
    const now = new Date("2026-09-07T00:00:00.000Z");
    const after = resolveSpacePurgeAfter(now);
    expect(after.toISOString()).toBe("2026-09-14T00:00:00.000Z");
    vi.unstubAllEnvs();
  });

  it("honours zero as the next sweep", async () => {
    const { resolveSpacePurgeAfter } = await import("./spaces.js");
    vi.stubEnv("ENGENTY_SPACE_PURGE_AFTER_DAYS", "0");
    const now = new Date("2026-09-07T00:00:00.000Z");
    expect(resolveSpacePurgeAfter(now).toISOString()).toBe(
      "2026-09-07T00:00:00.000Z"
    );
    vi.unstubAllEnvs();
  });
});
