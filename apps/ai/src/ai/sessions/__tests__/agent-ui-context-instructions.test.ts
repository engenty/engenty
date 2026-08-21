import { createFrontendToolDefinition } from "@engenty/ag-ui-bridge";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAgentUiContextInstructions } from "../agent-ui-context-instructions.js";

const resolveAgentSystemPromptFromUiState = vi.fn();

vi.mock("../../core-http-client.js", () => ({
  EngentyCoreClient: class MockEngentyCoreClient {
    resolveAgentSystemPromptFromUiState = resolveAgentSystemPromptFromUiState;
  },
  getEngentyCoreBaseUrlFromEnv: () => "http://127.0.0.1:8787",
}));

const resolveModuleSkillCatalogHint = vi.fn();

vi.mock("../../skills/module-skill-hint.js", () => ({
  resolveModuleSkillCatalogHint: (input: unknown) =>
    resolveModuleSkillCatalogHint(input),
}));

describe("buildAgentUiContextInstructions", () => {
  afterEach(() => {
    resolveAgentSystemPromptFromUiState.mockReset();
    resolveModuleSkillCatalogHint.mockReset();
  });

  it("returns frontend tool instructions when state_snapshot is missing", async () => {
    const result = await buildAgentUiContextInstructions({
      agentId: "engenty.copilot",
      agentUi: { frontend_tools: [] },
      scope: {
        tenantId: "t1",
        credential: { kind: "user", token: "token" },
        userId: "u1",
      },
    });
    expect(result).toContain("run in the user's browser");
    expect(result).toContain("navigate");
    expect(resolveAgentSystemPromptFromUiState).not.toHaveBeenCalled();
  });

  it("includes client-provided frontend tools in runtime instructions", async () => {
    const result = await buildAgentUiContextInstructions({
      agentId: "engenty.copilot",
      agentUi: {
        frontend_tools: [
          createFrontendToolDefinition({
            availability: "enabled",
            description: "Open a test panel.",
            name: "test.openPanel",
            parameters: {
              type: "object",
              properties: { mode: { enum: ["a", "b"], type: "string" } },
              required: ["mode"],
            },
          }),
        ],
      },
      scope: {
        tenantId: "t1",
        credential: { kind: "user", token: "token" },
        userId: "u1",
      },
    });
    // Native tools carry their own typed schema in the tool list; the instructions
    // only need to name the browser tools so the model knows they exist.
    expect(result).toContain("test.openPanel");
    expect(result).toContain("Browser tools available now:");
    expect(result).not.toContain("Prefer browser_dom_snapshot");
  });

  it("adds DOM-first guidance when browser DOM tools are registered", async () => {
    const result = await buildAgentUiContextInstructions({
      agentId: "engenty.copilot",
      agentUi: {
        frontend_tools: [
          createFrontendToolDefinition({
            availability: "enabled",
            description: "DOM snapshot",
            name: "browser_dom_snapshot",
            parameters: {
              type: "object",
              properties: { root_selector: { type: "string" } },
            },
          }),
          createFrontendToolDefinition({
            availability: "enabled",
            description: "Screenshot",
            name: "browser_screenshot",
            parameters: { type: "object", properties: {} },
          }),
        ],
      },
      scope: {
        tenantId: "t1",
        credential: { kind: "user", token: "token" },
        userId: "u1",
      },
    });
    expect(result).toContain(
      "Prefer browser_dom_snapshot over browser_screenshot"
    );
    expect(result).toContain("dom_entry_points");
  });

  it("includes generic AG-UI snapshot instructions when snapshot is present", async () => {
    resolveAgentSystemPromptFromUiState.mockResolvedValue({
      system_prompt: "",
    });
    const snapshot = {
      observed_at: new Date().toISOString(),
      route: {
        module_id: "engenty-copilot",
        pathname: "/mdl/team/m1",
        route_key: "chat",
      },
      selection: { entity_id: "m1", entity_type: "team" },
      sequence: 1,
      shell: { copilot_open: true },
      snapshot_id: "snap-1",
      version: 1 as const,
    };
    const result = await buildAgentUiContextInstructions({
      agentId: "engenty.copilot",
      agentUi: { frontend_tools: [], state_snapshot: snapshot },
      scope: {
        tenantId: "t1",
        credential: { kind: "user", token: "token" },
        userId: "u1",
      },
    });
    expect(result).toContain("pathname: /mdl/team/m1");
    expect(result).toContain("page_module: team");
  });

  it("returns system prompt from core when snapshot is present", async () => {
    resolveAgentSystemPromptFromUiState.mockResolvedValue({
      system_prompt: "Current task (preloaded)",
    });
    const snapshot = {
      observed_at: new Date().toISOString(),
      page: { task_snapshot: { identifier: "ENG-1" } },
      route: {
        module_id: "tasks",
        pathname: "/mdl/tasks/x",
        route_key: "detail",
      },
      sequence: 1,
      shell: { copilot_open: true },
      snapshot_id: "snap-1",
      version: 1 as const,
    };
    const result = await buildAgentUiContextInstructions({
      agentId: "tasks.assist",
      agentUi: { frontend_tools: [], state_snapshot: snapshot },
      scope: {
        tenantId: "t1",
        credential: { kind: "user", token: "token" },
        userId: "u1",
      },
    });
    // A specialist still gets its page context — it just holds no browser tools.
    expect(result).not.toContain("run in the user's browser");
    expect(result).toContain("pathname: /mdl/tasks/x");
    expect(result).toContain("Current task (preloaded)");
    expect(resolveAgentSystemPromptFromUiState).toHaveBeenCalledWith(
      "tasks.assist",
      snapshot
    );
  });

  it("injects the module skill catalog hint for copilot runs with a module context", async () => {
    resolveAgentSystemPromptFromUiState.mockResolvedValue({
      system_prompt: "",
    });
    resolveModuleSkillCatalogHint.mockResolvedValue(
      "## Skills for the current module (contacts)\n- contacts-search — find contacts"
    );
    const snapshot = {
      observed_at: new Date().toISOString(),
      route: {
        module_id: "contacts",
        pathname: "/module/contacts",
        route_key: "list",
      },
      sequence: 1,
      shell: { copilot_open: true },
      snapshot_id: "snap-1",
      version: 1 as const,
    };
    const result = await buildAgentUiContextInstructions({
      agentId: "engenty.copilot",
      agentUi: { frontend_tools: [], state_snapshot: snapshot },
      scope: {
        tenantId: "t1",
        credential: { kind: "user", token: "token" },
        userId: "u1",
      },
    });
    expect(result).toContain("## Skills for the current module (contacts)");
    expect(resolveModuleSkillCatalogHint).toHaveBeenCalledWith(
      expect.objectContaining({ moduleId: "contacts", tenantId: "t1" })
    );
  });

  it("skips the skill hint for non-copilot agents and module-less snapshots", async () => {
    resolveAgentSystemPromptFromUiState.mockResolvedValue({
      system_prompt: "",
    });
    const snapshot = {
      observed_at: new Date().toISOString(),
      route: {
        module_id: "contacts",
        pathname: "/module/contacts",
        route_key: "list",
      },
      sequence: 1,
      shell: { copilot_open: true },
      snapshot_id: "snap-1",
      version: 1 as const,
    };
    await buildAgentUiContextInstructions({
      agentId: "tasks.assist",
      agentUi: { frontend_tools: [], state_snapshot: snapshot },
      scope: {
        tenantId: "t1",
        credential: { kind: "user", token: "token" },
        userId: "u1",
      },
    });
    await buildAgentUiContextInstructions({
      agentId: "engenty.copilot",
      agentUi: {
        frontend_tools: [],
        // The wire type marks `route` required, but a client can legitimately
        // send a snapshot without one — that is exactly the case under test.
        state_snapshot: {
          ...snapshot,
          route: undefined,
        } as unknown as typeof snapshot,
      },
      scope: {
        tenantId: "t1",
        credential: { kind: "user", token: "token" },
        userId: "u1",
      },
    });
    expect(resolveModuleSkillCatalogHint).not.toHaveBeenCalled();
  });
  it("gives a worker agent no browser tools, whatever the client registered", async () => {
    // A frontend tool suspends the run until a client resumes it. A specialist
    // is meant to run unattended too, so it never holds one — and the prompt
    // must not name tools it does not have.
    const result = await buildAgentUiContextInstructions({
      agentId: "time-tracking.tracker",
      agentUi: {
        frontend_tools: [
          createFrontendToolDefinition({
            availability: "enabled",
            description: "Navigate to an internal app path.",
            name: "navigate",
            parameters: { type: "object", properties: {} },
          }),
        ],
      },
      scope: {
        tenantId: "t1",
        credential: { kind: "user", token: "token" },
        userId: "u1",
      },
    });
    expect(result).not.toContain("run in the user's browser");
    expect(result).not.toContain("Browser tools available now:");
    expect(result).not.toContain("navigate");
  });
});
