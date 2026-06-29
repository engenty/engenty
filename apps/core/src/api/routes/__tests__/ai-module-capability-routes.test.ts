import {
  registerAiRegistration,
  unregisterAiRegistration,
} from "@engenty/ai-core";
import { OpenAPIHono } from "@hono/zod-openapi";
import { SignJWT } from "jose";
import { afterEach, describe, expect, it } from "vitest";
import { registerAiModuleCapabilityRoutes } from "../ai-module-capability-routes.js";

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

describe("ai module capability routes", () => {
  const secret = "test-secret";

  afterEach(() => {
    unregisterAiRegistration("tasks");
  });

  it("returns registered module dynamic agent metadata", async () => {
    registerAiRegistration({
      module_id: "tasks",
      dynamic: {
        agent_configs: [
          {
            id: "tasks.assist",
            instructions: "Help with tasks.",
            model: "openai/gpt-4.1-mini",
            name: "Tasks Assist",
            skillIds: ["task-workflow"],
            source: "module",
            toolIds: ["engenty_tools_search", "engenty_tool_execute"],
          },
        ],
        skills: {
          "task-workflow": "# Task workflow",
        },
      },
    });

    const app = new OpenAPIHono();
    registerAiModuleCapabilityRoutes(app, { securityJwtSecret: secret });

    const token = await signToken(secret);
    const response = await app.request("/api/tools/module-capabilities", {
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: {
        capabilities: Array<{
          moduleId: string;
          agentConfigs?: Array<{ id: string }>;
        }>;
      };
    };
    expect(body.data.capabilities).toEqual([
      expect.objectContaining({
        moduleId: "tasks",
        agentConfigs: [expect.objectContaining({ id: "tasks.assist" })],
      }),
    ]);
  });
});
