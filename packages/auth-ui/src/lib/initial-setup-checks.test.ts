import { afterEach, describe, expect, it, vi } from "vitest";
import {
  attentionCount,
  probeAiServiceFromBrowser,
  readSetupChecks,
  type SetupCheck,
  setupBlocked,
} from "./initial-setup-checks";

const ok: SetupCheck = { id: "a", label: "A", status: "ok" };
const warn: SetupCheck = { id: "b", label: "B", status: "warn", step: 3 };
const fail: SetupCheck = { id: "c", label: "C", status: "fail", fix: "x" };

describe("setupBlocked / attentionCount", () => {
  it("blocks only on failures and counts every non-ok row", () => {
    expect(setupBlocked([ok, warn])).toBe(false);
    expect(setupBlocked([ok, fail])).toBe(true);
    expect(attentionCount([ok, warn, fail])).toBe(2);
  });
});

describe("readSetupChecks", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns core's rows", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: { checks: [ok, warn] } }), {
            headers: { "content-type": "application/json" },
            status: 200,
          })
      )
    );
    expect(await readSetupChecks()).toEqual([ok, warn]);
  });

  it("is empty once setup is complete", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 409 }))
    );
    expect(await readSetupChecks()).toEqual([]);
  });
});

describe("probeAiServiceFromBrowser", () => {
  it("passes on a healthy answer", async () => {
    const check = await probeAiServiceFromBrowser(
      (async () => new Response("{}", { status: 200 })) as typeof fetch
    );
    expect(check.status).toBe("ok");
    expect(check.detail).toMatch(/\/ai\/health$/);
  });

  it("fails with a fix when the browser cannot reach it", async () => {
    const check = await probeAiServiceFromBrowser((async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch);
    expect(check.status).toBe("fail");
    expect(check.fix).toContain("pnpm");
  });
});
