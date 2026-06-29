import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppsAiRealtimeSession } from "./realtime-session.js";

describe("createAppsAiRealtimeSession", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to apps/ai realtime session route", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        provider: "openai",
        model: "gpt-realtime-2",
        voice: "marin",
        client_secret: {
          expires_at: 1_800_000_000,
          value: "ek_test",
        },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createAppsAiRealtimeSession({
      baseUrl: "https://ai.engenty_localhost/",
      headers: { Authorization: "Bearer user-token" },
      voice: "marin",
    });

    expect(result.client_secret.value).toBe("ek_test");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ai.engenty_localhost/ai/v1/realtime/sessions",
      expect.objectContaining({
        body: JSON.stringify({ voice: "marin" }),
        headers: {
          Authorization: "Bearer user-token",
          "content-type": "application/json",
        },
        method: "POST",
      })
    );
  });

  it("can post to a public same-origin realtime session route without auth headers", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        provider: "openai",
        model: "gpt-realtime-2",
        voice: "marin",
        client_secret: {
          expires_at: 1_800_000_000,
          value: "ek_public",
        },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createAppsAiRealtimeSession({
      auth: "none",
      sessionPath: "/api/public/chatbot/emb_test/realtime-session",
      visitorId: "visitor-1",
    });

    expect(result.client_secret.value).toBe("ek_public");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/public/chatbot/emb_test/realtime-session",
      expect.objectContaining({
        body: JSON.stringify({ visitor_id: "visitor-1" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      })
    );
  });
});
