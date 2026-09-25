/**
 * The Company space and personal spaces must not be markable for deletion:
 * `core.purge_space` only refuses the default space, not a personal one.
 */
import { describe, expect, it, vi } from "vitest";
import { markSpaceDeleted, type SpaceRow } from "./spaces.js";

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

/** Answers the pre-read `getSpaceById`; the guards throw before any write. */
function stubClient(current: SpaceRow) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  Object.assign(builder, {
    eq: chain,
    is: chain,
    maybeSingle: () => Promise.resolve({ data: current, error: null }),
    select: chain,
  });
  return { schema: () => ({ from: () => builder }) } as never;
}

describe("markSpaceDeleted", () => {
  it("refuses the Company space", async () => {
    const company = row({ id: SPACE, is_default: true, key: "company" });
    await expect(
      markSpaceDeleted(stubClient(company), TENANT, SPACE)
    ).rejects.toThrow("space_is_default");
  });

  it("refuses a personal space", async () => {
    const personal = row({
      id: SPACE,
      key: "alice",
      owner_user_id: OWNER,
      visibility: "private",
    });
    await expect(
      markSpaceDeleted(stubClient(personal), TENANT, SPACE)
    ).rejects.toThrow("space_is_personal");
  });
});

describe("resolveSpacePurgeAfter", () => {
  // The delete dialog promises seven days before permanent removal.
  it("defaults to seven days", async () => {
    const { resolveSpacePurgeAfter } = await import("./spaces.js");
    vi.stubEnv("ENGENTY_SPACE_PURGE_AFTER_DAYS", "");
    const now = new Date("2026-09-07T00:00:00.000Z");
    const after = resolveSpacePurgeAfter(now);
    expect(after.toISOString()).toBe("2026-09-14T00:00:00.000Z");
    vi.unstubAllEnvs();
  });
});
