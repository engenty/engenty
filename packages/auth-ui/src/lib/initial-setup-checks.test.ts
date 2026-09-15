import { setRuntimeEnvOverrides } from "@engenty/environment";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  aiProviderEnvKeysFromChecks,
  aiProviderLabelFromEnvKeys,
  attentionCount,
  decideAiProviderStep,
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

describe("decideAiProviderStep", () => {
  const providerOk: SetupCheck = {
    detail: "AI_GATEWAY_API_KEY, OPENAI_API_KEY set",
    id: "ai_provider",
    label: "AI provider key",
    status: "ok",
  };

  it("reads the env keys the gate already marked ok", () => {
    expect(aiProviderEnvKeysFromChecks([ok, providerOk])).toEqual([
      "AI_GATEWAY_API_KEY",
      "OPENAI_API_KEY",
    ]);
    expect(
      aiProviderLabelFromEnvKeys(["AI_GATEWAY_API_KEY", "OPENAI_API_KEY"])
    ).toBe("Vercel AI Gateway, OpenAI");
    expect(aiProviderEnvKeysFromChecks([warn])).toEqual([]);
  });

  it("keeps the server env key on empty Continue or Skip", () => {
    const envKeys = ["AI_GATEWAY_API_KEY"];
    expect(
      decideAiProviderStep({ envKeys, intent: "continue", pastedKey: "" })
    ).toEqual({ kind: "connected-env", label: "Vercel AI Gateway" });
    expect(
      decideAiProviderStep({ envKeys, intent: "skip", pastedKey: "" })
    ).toEqual({ kind: "connected-env", label: "Vercel AI Gateway" });
  });

  it("saves a pasted key and still asks for one when the env has none", () => {
    expect(
      decideAiProviderStep({
        envKeys: ["AI_GATEWAY_API_KEY"],
        intent: "continue",
        pastedKey: " vck_new ",
      })
    ).toEqual({ kind: "save", apiKey: "vck_new" });
    expect(
      decideAiProviderStep({ envKeys: [], intent: "continue", pastedKey: "" })
    ).toEqual({ kind: "need-key" });
    expect(
      decideAiProviderStep({ envKeys: [], intent: "skip", pastedKey: "" })
    ).toEqual({ kind: "skipped" });
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
  afterEach(() => {
    vi.unstubAllGlobals();
    setRuntimeEnvOverrides({ VITE_ENGENTY_AI_BASE_URL: undefined });
  });

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
    expect(check.fix).toContain("pnpm dev");
  });

  it("probes this page's origin, not a baked Portless VITE URL", async () => {
    vi.stubGlobal("window", {
      location: { origin: "http://localhost:5173" },
    });
    setRuntimeEnvOverrides({
      VITE_ENGENTY_AI_BASE_URL: "https://engenty.localhost",
    });
    const check = await probeAiServiceFromBrowser(
      (async () => new Response("{}", { status: 200 })) as typeof fetch
    );
    expect(check.detail).toBe("http://localhost:5173/ai/health");
  });

  it("names Portless when this page is a Portless origin", async () => {
    vi.stubGlobal("window", {
      location: { origin: "https://engenty.localhost" },
    });
    const check = await probeAiServiceFromBrowser((async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch);
    expect(check.detail).toContain("https://engenty.localhost/ai/health");
    expect(check.fix).toContain("pnpm portless");
    expect(check.fix).not.toContain("app runs on localhost");
  });
});
