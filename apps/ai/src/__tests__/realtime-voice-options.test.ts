import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";

describe("realtime voice-options route", () => {
  it("requires authenticated AI scope", async () => {
    const app = await createApp({
      agentRunStore: null,
      disableGatewayModelScheduler: true,
      realtimeVoiceConfigResolver: null,
      registryStore: null,
      scopeResolver: async () => ({
        error: "agent_threads.unauthorized",
        ok: false,
        status: 401,
      }),
      threadStore: null,
      usageStore: null,
    });
    const res = await app.request(
      "http://localhost/ai/v1/realtime/voice-options"
    );
    expect(res.status).toBe(401);
  });
});
