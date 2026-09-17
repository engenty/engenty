import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Space } from "@/lib/api/spaces-client";
import {
  forgetRememberedSpaceKeyMemoryForTests,
  LAST_SPACE_STORAGE_KEY,
  pickLandingSpace,
  rememberedSpaceKey,
  rememberSpaceKey,
  resetRememberedSpaceKeyForTests,
} from "./landing-space";

function space(
  overrides: Partial<Space> & Pick<Space, "key">
): Pick<Space, "deletedAt" | "isDefault" | "key" | "ownerUserId"> {
  return {
    deletedAt: null,
    isDefault: false,
    ownerUserId: null,
    ...overrides,
  };
}

describe("pickLandingSpace", () => {
  const personal = space({ key: "matthias", ownerUserId: "u1" });
  const company = space({ key: "company", isDefault: true });
  const sport = space({ key: "sport" });

  it("returns the last visited space when it is still in the list", () => {
    expect(pickLandingSpace([personal, company, sport], "sport")?.key).toBe(
      "sport"
    );
  });

  it("skips a remembered key that was deleted or left behind", () => {
    expect(
      pickLandingSpace(
        [personal, company, { ...sport, deletedAt: "2026-01-01T00:00:00Z" }],
        "sport"
      )?.key
    ).toBe("matthias");
    expect(pickLandingSpace([personal, company], "gone")?.key).toBe("matthias");
  });

  it("falls back to personal, then the tenant default", () => {
    expect(pickLandingSpace([company, personal, sport], null)?.key).toBe(
      "matthias"
    );
    expect(pickLandingSpace([company, sport], null)?.key).toBe("company");
    expect(pickLandingSpace([sport], null)?.key).toBe("sport");
    expect(pickLandingSpace([], "sport")).toBeNull();
  });
});

describe("rememberedSpaceKey", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      removeItem: (key: string) => {
        store.delete(key);
      },
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    });
    resetRememberedSpaceKeyForTests();
  });

  afterEach(() => {
    resetRememberedSpaceKeyForTests();
    vi.unstubAllGlobals();
  });

  it("persists across a simulated reload", () => {
    rememberSpaceKey("sport");
    expect(store.get(LAST_SPACE_STORAGE_KEY)).toBe("sport");
    forgetRememberedSpaceKeyMemoryForTests();
    expect(rememberedSpaceKey()).toBe("sport");
  });
});
