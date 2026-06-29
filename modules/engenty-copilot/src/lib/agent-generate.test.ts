import { afterEach, describe, expect, it, vi } from "vitest";
import { postAiAgentGenerate } from "./agent-generate.js";

describe("postAiAgentGenerate", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs messages and returns assistant text (default agent)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: "Hello from agent" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const out = await postAiAgentGenerate({
      serviceBaseUrl: "http://127.0.0.1:8790",
      messages: [{ role: "user", content: "Hi" }],
    });

    expect(out.text).toBe("Hello from agent");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe(
      "http://127.0.0.1:8790/ai/agents/engenty.copilot/generate"
    );
    expect(init.method).toBe("POST");
    expect(init.body).toBe(
      JSON.stringify({ messages: [{ role: "user", content: "Hi" }] })
    );
  });

  it("uses custom agentId in path", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ text: "ok" }), { status: 200 })
      );
    vi.stubGlobal("fetch", fetchMock);

    await postAiAgentGenerate({
      agentId: "other-agent",
      serviceBaseUrl: "http://127.0.0.1:8790",
      messages: [{ role: "user", content: "Hi" }],
    });

    const [calledUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe(
      "http://127.0.0.1:8790/ai/agents/other-agent/generate"
    );
  });

  it("throws when serviceBaseUrl is empty", async () => {
    await expect(
      postAiAgentGenerate({
        serviceBaseUrl: "",
        messages: [{ role: "user", content: "Hi" }],
      })
    ).rejects.toThrow(/missing serviceBaseUrl/);
  });

  it("throws on non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 502 }))
    );

    await expect(
      postAiAgentGenerate({
        serviceBaseUrl: "https://ai.engenty.localhost",
        messages: [{ role: "user", content: "x" }],
      })
    ).rejects.toThrow(/HTTP 502/);
  });
});
