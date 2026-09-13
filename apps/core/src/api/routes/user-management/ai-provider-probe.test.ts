import { describe, expect, it } from "vitest";
import { probeAiProviderKey } from "./ai-provider-probe.js";

function fetchAnswering(status: number): typeof fetch {
  return (async () => new Response("{}", { status })) as typeof fetch;
}

describe("probeAiProviderKey", () => {
  it("reports a live key", async () => {
    const result = await probeAiProviderKey({
      apiKey: "k",
      fetchImpl: fetchAnswering(200),
      gateway: "vercel",
    });
    expect(result.status).toBe("valid");
  });

  it("reports a rejected key on 401", async () => {
    const result = await probeAiProviderKey({
      apiKey: "k",
      fetchImpl: fetchAnswering(401),
      gateway: "openrouter",
    });
    expect(result.status).toBe("invalid");
    expect(result.detail).toContain("OpenRouter");
  });

  it("does not call a 5xx or a network failure a verdict", async () => {
    expect(
      (
        await probeAiProviderKey({
          apiKey: "k",
          fetchImpl: fetchAnswering(503),
          gateway: "vercel",
        })
      ).status
    ).toBe("unverified");
    expect(
      (
        await probeAiProviderKey({
          apiKey: "k",
          fetchImpl: (async () => {
            throw new Error("ENOTFOUND");
          }) as typeof fetch,
          gateway: "vercel",
        })
      ).status
    ).toBe("unverified");
  });

  it("sends the key as a bearer to the gateway's auth endpoint", async () => {
    let seen: { headers?: HeadersInit; url?: string } = {};
    await probeAiProviderKey({
      apiKey: "secret",
      fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
        seen = { headers: init?.headers, url: String(url) };
        return new Response("{}", { status: 200 });
      }) as typeof fetch,
      gateway: "openrouter",
    });
    expect(seen.url).toBe("https://openrouter.ai/api/v1/key");
    expect((seen.headers as Record<string, string>).authorization).toBe(
      "Bearer secret"
    );
  });
});
