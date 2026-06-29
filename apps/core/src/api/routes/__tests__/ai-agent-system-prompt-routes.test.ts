import {
  registerAiRegistration,
  unregisterAiRegistration,
} from "@engenty/ai-core";
import { OpenAPIHono } from "@hono/zod-openapi";
import { SignJWT } from "jose";
import { afterEach, describe, expect, it } from "vitest";
import { registerAiAgentSystemPromptRoutes } from "../ai-agent-system-prompt-routes.js";

async function signToken(secret: string) {
  return new SignJWT({
    capabilities: ["module.read"],
    role: "user",
    tenant_id: "tenant-1",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("user-1")
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(secret));
}

function makeUiState() {
  return {
    observed_at: new Date().toISOString(),
    page: {
      task_snapshot: {
        identifier: "ENG-1",
        title: "Ship tasks module",
        status: "in_progress",
      },
    },
    route: {
      module_id: "tasks",
      pathname: "/mdl/tasks/task-1",
      route_key: "detail",
    },
    selection: { entity_id: "task-1", entity_type: "task" },
    sequence: 1,
    shell: { copilot_open: true },
    snapshot_id: "snap-test",
    version: 1 as const,
  };
}

describe("ai agent system prompt routes", () => {
  const secret = "test-secret";

  afterEach(() => {
    unregisterAiRegistration("tasks");
  });

  it("returns system prompt from registered agent build_system_prompt", async () => {
    registerAiRegistration({
      module_id: "tasks",
      agents: [
        {
          build_system_prompt: async ({ context }) => {
            const snapshot = context?.task_snapshot;
            return snapshot
              ? `Preloaded: ${JSON.stringify(snapshot)}`
              : "No preload";
          },
          build_tools: () => ({}),
          id: "tasks.assist",
          instruction_keys: [],
          module_id: "tasks",
          name: "Tasks Assist",
        },
      ],
    });

    const app = new OpenAPIHono();
    registerAiAgentSystemPromptRoutes(app, { securityJwtSecret: secret });

    const token = await signToken(secret);
    const response = await app.request("/api/tools/agent-system-prompt", {
      body: JSON.stringify({
        agent_id: "tasks.assist",
        ui_state: makeUiState(),
      }),
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { system_prompt: string };
    };
    expect(body.data.system_prompt).toContain("Preloaded:");
    expect(body.data.system_prompt).toContain("ENG-1");
  });

  it("rejects invalid ui_state", async () => {
    const app = new OpenAPIHono();
    registerAiAgentSystemPromptRoutes(app, { securityJwtSecret: secret });
    const token = await signToken(secret);
    const response = await app.request("/api/tools/agent-system-prompt", {
      body: JSON.stringify({
        agent_id: "tasks.assist",
        ui_state: { version: 99 },
      }),
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(response.status).toBe(400);
  });
});
