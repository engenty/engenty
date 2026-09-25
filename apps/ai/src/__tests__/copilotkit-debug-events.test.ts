import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAgUiDebugEventBus,
  registerCopilotKitDebugEventRoutes,
} from "../api/copilotkit-debug-events.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("CopilotKit AG-UI debug events", () => {
  // The stream is unauthenticated and carries every run's events.
  it("disables the endpoint in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const app = new Hono();
    registerCopilotKitDebugEventRoutes(app as never, {
      bus: createAgUiDebugEventBus(),
    });

    const response = await app.request("http://localhost/ai/cpk-debug-events");

    expect(response.status).toBe(404);
  });
});
