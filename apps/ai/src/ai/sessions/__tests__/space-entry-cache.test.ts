import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canEnterSpaceDefault,
  clearSpaceEntryCacheForTests,
  SPACE_ENTRY_CACHE_TTL_MS,
} from "../thread-access.js";

// Ways this can fail: every page still round-trips to core (no cache); a
// "no" is remembered, so access granted a moment later stays refused; one
// person's "yes" lets another person in; a removal never takes effect.

const getSpaceSurface = vi.fn(async (_spaceId: string) => ({}));

vi.mock("../../core-http-client.js", () => ({
  EngentyCoreClient: class {
    getSpaceSurface = getSpaceSurface;
  },
  getEngentyCoreBaseUrlFromEnv: () => "http://core.test",
}));

const SPACE = "22222222-2222-4222-8222-222222222222";
const scopeOf = (userId: string) =>
  ({
    credential: { kind: "user", token: `token-${userId}` },
    tenantId: "t-1",
    userId,
  }) as never;

describe("canEnterSpaceDefault cache", () => {
  beforeEach(() => {
    clearSpaceEntryCacheForTests();
    getSpaceSurface.mockReset();
    getSpaceSurface.mockResolvedValue({});
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks core once for repeated entries by the same person", async () => {
    await expect(canEnterSpaceDefault(scopeOf("u-1"), SPACE)).resolves.toBe(
      true
    );
    await expect(canEnterSpaceDefault(scopeOf("u-1"), SPACE)).resolves.toBe(
      true
    );
    expect(getSpaceSurface).toHaveBeenCalledTimes(1);
  });

  it("does not let one person's yes admit another", async () => {
    await canEnterSpaceDefault(scopeOf("u-1"), SPACE);
    getSpaceSurface.mockRejectedValueOnce(new Error("403"));
    await expect(canEnterSpaceDefault(scopeOf("u-2"), SPACE)).resolves.toBe(
      false
    );
  });

  it("asks again after a no, so access granted since works at once", async () => {
    getSpaceSurface.mockRejectedValueOnce(new Error("403"));
    await expect(canEnterSpaceDefault(scopeOf("u-1"), SPACE)).resolves.toBe(
      false
    );
    await expect(canEnterSpaceDefault(scopeOf("u-1"), SPACE)).resolves.toBe(
      true
    );
  });

  it("asks again once the grant is older than the TTL", async () => {
    await canEnterSpaceDefault(scopeOf("u-1"), SPACE);
    vi.advanceTimersByTime(SPACE_ENTRY_CACHE_TTL_MS + 1);
    getSpaceSurface.mockRejectedValueOnce(new Error("403"));
    await expect(canEnterSpaceDefault(scopeOf("u-1"), SPACE)).resolves.toBe(
      false
    );
  });
});
