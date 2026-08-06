import { EventType, parseAgUiSseChunk } from "@engenty/ag-ui-bridge";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAgUiDebugEventBus,
  registerCopilotKitDebugEventRoutes,
} from "../api/copilotkit-debug-events.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

async function readDebugEvents(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) {
    return [];
  }
  const decoder = new TextDecoder();
  let text = "";
  for (let index = 0; index < 4; index += 1) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    text += decoder.decode(value, { stream: true });
    if (text.includes("RUN_STARTED")) {
      break;
    }
  }
  await reader.cancel();
  return parseAgUiSseChunk(text);
}

describe("CopilotKit AG-UI debug events", () => {
  it("streams replayed AG-UI events on the /ai-prefixed endpoint", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const bus = createAgUiDebugEventBus();
    bus.publish({
      type: EventType.RUN_STARTED,
      runId: "run-1",
      threadId: "thread-1",
    });
    const app = new Hono();
    registerCopilotKitDebugEventRoutes(app as never, { bus });

    const response = await app.request("http://localhost/ai/cpk-debug-events");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    await expect(readDebugEvents(response)).resolves.toEqual([
      expect.objectContaining({
        runId: "run-1",
        threadId: "thread-1",
        type: EventType.RUN_STARTED,
      }),
    ]);
  });

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
