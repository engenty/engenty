import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentConfig } from "../../ai/registry/types.js";
import {
  generateAgentDeskStarters,
  resetGeneratedStartersCacheForTests,
} from "../generate-starters.js";

const SPACE_ID = "00000000-0000-4000-8000-000000000001";
const AGENT_ID = "tasks.assist";
const USER_ID = "00000000-0000-4000-8000-000000000002";

const agent: AgentConfig = {
  id: AGENT_ID,
  instructions: "Help with tasks.",
  model: "test/model",
  name: "Tasks Assist",
  skillIds: ["task-workflow"],
  starters: [
    {
      id: "tasks-plan-today",
      label: "Plan today's work",
      prompt: "Plan today.",
    },
  ],
  toolIds: [],
};

function dependencies(
  patch: Partial<
    Parameters<typeof generateAgentDeskStarters>[0]["dependencies"]
  > = {}
) {
  return {
    getAgent: async () => agent,
    getSpaceSurface: async () => ({
      agents: [AGENT_ID],
      capabilities: [],
      connections: [],
      connectors: [],
      modules: [],
      skills: [],
      spaceId: SPACE_ID,
    }),
    getTenantSettings: async () => ({ generated_starters: true }),
    listFirstUserMessages: async () => ["What is blocked?"],
    listSpaces: async () => [{ id: SPACE_ID, key: "company", name: "Company" }],
    listThreads: async () => [],
    ...patch,
  };
}

describe("generateAgentDeskStarters", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetGeneratedStartersCacheForTests();
  });

  it("returns disabled without calling the model when the tenant has not opted in", async () => {
    const generate = vi.fn();
    const result = await generateAgentDeskStarters({
      agentId: AGENT_ID,
      dependencies: dependencies({
        generate,
        getTenantSettings: async () => ({ generated_starters: false }),
      }),
      locale: "en",
      spaceId: SPACE_ID,
      tenantId: "00000000-0000-4000-8000-000000000003",
      userId: USER_ID,
    });
    expect(result).toEqual({ enabled: false, starters: [] });
    expect(generate).not.toHaveBeenCalled();
  });

  it("returns generated chips when opted in", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    const result = await generateAgentDeskStarters({
      agentId: AGENT_ID,
      dependencies: dependencies({
        generate: async () => [
          { id: "extra", label: "Extra job", prompt: "Do the extra job." },
        ],
      }),
      locale: "en",
      spaceId: SPACE_ID,
      tenantId: "00000000-0000-4000-8000-000000000003",
      userId: USER_ID,
    });
    expect(result.enabled).toBe(true);
    expect(result.starters).toEqual([
      { id: "extra", label: "Extra job", prompt: "Do the extra job." },
    ]);
  });

  it("does not serve one user's generated chips to another", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    // The prompt is seeded from the caller's own thread history, so the cache
    // key must be per-viewer: same tenant/space/agent/locale, different user.
    const generate = vi.fn(async () => [
      { id: "extra", label: "Extra job", prompt: "Do the extra job." },
    ]);
    const base = {
      agentId: AGENT_ID,
      dependencies: dependencies({ generate }),
      locale: "en",
      spaceId: SPACE_ID,
      tenantId: "00000000-0000-4000-8000-000000000003",
    };
    await generateAgentDeskStarters({ ...base, userId: USER_ID });
    await generateAgentDeskStarters({
      ...base,
      userId: "00000000-0000-4000-8000-0000000000ff",
    });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("serves a fresh cache hit without calling the model again", async () => {
    const generate = vi.fn(async () => [
      { id: "extra", label: "Extra job", prompt: "Do the extra job." },
    ]);
    const input = {
      agentId: AGENT_ID,
      dependencies: dependencies({ generate }),
      locale: "en",
      spaceId: SPACE_ID,
      tenantId: "00000000-0000-4000-8000-000000000003",
      userId: USER_ID,
    };
    await generateAgentDeskStarters(input);
    await generateAgentDeskStarters(input);
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
