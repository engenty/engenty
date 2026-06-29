import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureDevLoginUser, resolveDevLoginEmail } from "./dev-login";

vi.mock("./api-client", () => ({
  getApiBaseUrl: () => "http://test.local",
}));

describe("ensureDevLoginUser", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not throw when dev password does not match (401)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Invalid dev password" }), {
          status: 401,
        })
      )
    );

    await expect(
      ensureDevLoginUser({ email: "user@test.com", password: "real-password" })
    ).resolves.toBeUndefined();
  });
});

describe("resolveDevLoginEmail", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prefers query email over defaults", () => {
    expect(
      resolveDevLoginEmail({
        queryEmail: "query@test.local",
        statusDefaultEmail: "status@test.local",
      })
    ).toBe("query@test.local");
  });

  it("falls back to agent@engenty.local when no overrides", () => {
    vi.stubEnv("VITE_ENGENTY_DEV_EMAIL", "");
    expect(resolveDevLoginEmail({ queryEmail: "  " })).toBe(
      "agent@engenty.local"
    );
  });

  it("prefers VITE_ENGENTY_DEV_EMAIL over status default", () => {
    vi.stubEnv("VITE_ENGENTY_DEV_EMAIL", "env@test.local");
    expect(
      resolveDevLoginEmail({
        queryEmail: "  ",
        statusDefaultEmail: "status@test.local",
      })
    ).toBe("env@test.local");
  });
});
