import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDefaultSpaceCache,
  resolveDefaultSpaceId,
} from "./default-space.js";

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SPACE = "55555555-5555-4555-8555-555555555555";

/**
 * Records the query the helper builds so the test can assert BOTH filters are
 * applied — a lookup missing `tenant_id` would return another tenant's space
 * and root this tenant's bytes under it.
 */
function fakeClient(result: {
  data?: { id?: unknown } | null;
  error?: { message?: string } | null;
}) {
  const calls: [string, boolean | string][] = [];
  const schema = vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => {
        const filter = {
          eq: (column: string, value: boolean | string) => {
            calls.push([column, value]);
            return filter;
          },
          maybeSingle: () =>
            Promise.resolve({
              data: result.data ?? null,
              error: result.error ?? null,
            }),
        };
        return filter;
      }),
    })),
  }));
  return { calls, client: { schema } as never, schema };
}

describe("resolveDefaultSpaceId", () => {
  beforeEach(() => {
    clearDefaultSpaceCache();
  });

  it("filters by tenant AND is_default", async () => {
    const { calls, client } = fakeClient({ data: { id: SPACE } });
    await expect(resolveDefaultSpaceId(client, TENANT)).resolves.toBe(SPACE);
    expect(calls).toEqual([
      ["tenant_id", TENANT],
      ["is_default", true],
    ]);
  });

  it("reads core.spaces, not a module schema", async () => {
    const { client, schema } = fakeClient({ data: { id: SPACE } });
    await resolveDefaultSpaceId(client, TENANT);
    expect(schema).toHaveBeenCalledWith("core");
  });

  it("memoizes per tenant — the id cannot change under a running process", async () => {
    const { client, schema } = fakeClient({ data: { id: SPACE } });
    await resolveDefaultSpaceId(client, TENANT);
    await resolveDefaultSpaceId(client, TENANT);
    expect(schema).toHaveBeenCalledOnce();
  });

  it("does not memoize across tenants", async () => {
    const first = fakeClient({ data: { id: SPACE } });
    await resolveDefaultSpaceId(first.client, TENANT);
    const second = fakeClient({ data: { id: "other-space" } });
    await expect(
      resolveDefaultSpaceId(
        second.client,
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
      )
    ).resolves.toBe("other-space");
  });

  it("throws rather than returning a plausible id", async () => {
    await expect(
      resolveDefaultSpaceId(fakeClient({ data: { id: SPACE } }).client, "  ")
    ).rejects.toThrow("tenant_id_required");
    await expect(
      resolveDefaultSpaceId(fakeClient({ data: null }).client, TENANT)
    ).rejects.toThrow("default_space_missing_for_tenant");
    await expect(
      resolveDefaultSpaceId(
        fakeClient({ error: { message: "boom" } }).client,
        TENANT
      )
    ).rejects.toThrow("default_space_lookup_failed: boom");
  });

  it("does not cache a failed lookup", async () => {
    const failing = fakeClient({ data: null });
    await expect(
      resolveDefaultSpaceId(failing.client, TENANT)
    ).rejects.toThrow();
    const ok = fakeClient({ data: { id: SPACE } });
    await expect(resolveDefaultSpaceId(ok.client, TENANT)).resolves.toBe(SPACE);
  });
});
