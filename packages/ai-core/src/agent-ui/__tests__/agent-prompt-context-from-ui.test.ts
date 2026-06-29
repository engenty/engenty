import type { AgentUiStateSnapshotV1 } from "@engenty/ag-ui-bridge";
import { afterEach, describe, expect, it } from "vitest";
import {
  registerAiRegistration,
  unregisterAiRegistration,
} from "../../registry.js";
import {
  buildAgentSystemPromptFromUiState,
  extractAgentPromptContextFromAgentUi,
  formatAgentUiStateHarnessInstructions,
} from "../agent-prompt-context-from-ui.js";

function makeSnapshot(
  overrides: Partial<AgentUiStateSnapshotV1> = {}
): AgentUiStateSnapshotV1 {
  return {
    observed_at: new Date().toISOString(),
    route: {
      module_id: "tasks",
      pathname: "/mdl/tasks/task-1",
      route_key: "detail",
    },
    sequence: 1,
    shell: { copilot_open: true },
    snapshot_id: "snap-1",
    version: 1,
    ...overrides,
  };
}

describe("extractAgentPromptContextFromAgentUi", () => {
  it("maps route, selection, and page keys for task detail", () => {
    const context = extractAgentPromptContextFromAgentUi(
      makeSnapshot({
        page: {
          task_snapshot: { identifier: "ENG-1", title: "Ship module" },
          task_title: "Ship module",
        },
        selection: { entity_id: "task-1", entity_type: "task" },
      })
    );

    expect(context.pathname).toBe("/mdl/tasks/task-1");
    expect(context.current_page_module).toBe("task");
    expect(context.current_module).toBe("task");
    expect(context.entityId).toBe("task-1");
    expect(context.entity_type).toBe("task");
    expect(context.route_key).toBe("detail");
    expect(context.task_snapshot).toEqual({
      identifier: "ENG-1",
      title: "Ship module",
    });
  });

  it("maps projects list preview from page", () => {
    const context = extractAgentPromptContextFromAgentUi(
      makeSnapshot({
        route: {
          module_id: "projects",
          pathname: "/mdl/projects",
          route_key: "list",
        },
        page: {
          list_search: "acme",
          projects_preview: [{ id: "p1", title: "Alpha" }],
        },
      })
    );

    expect(context.currentModule).toBe("projects");
    expect(context.list_search).toBe("acme");
    expect(context.projects_preview).toHaveLength(1);
  });

  it("maps contacts contact_snapshot from page", () => {
    const context = extractAgentPromptContextFromAgentUi(
      makeSnapshot({
        route: {
          module_id: "contacts",
          pathname: "/mdl/contacts/c1",
          route_key: "chat",
        },
        page: {
          contact_snapshot: { id: "c1", display_name: "Acme" },
          entity_title: "Acme",
        },
        selection: { entity_id: "c1", entity_type: "contact" },
      })
    );

    expect(context.contact_snapshot).toEqual({
      id: "c1",
      display_name: "Acme",
    });
    expect(context.entity_title).toBe("Acme");
  });
});

describe("formatAgentUiStateHarnessInstructions", () => {
  it("includes pathname and page module for copilot host routes", () => {
    const text = formatAgentUiStateHarnessInstructions(
      makeSnapshot({
        route: {
          module_id: "engenty-copilot",
          pathname: "/mdl/team/019e6a28-cdbc-79c9-8b96-47688bdabec3",
          route_key: "chat",
        },
        selection: {
          entity_id: "019e6a28-cdbc-79c9-8b96-47688bdabec3",
          entity_type: "team",
        },
      })
    );

    expect(text).toContain(
      "pathname: /mdl/team/019e6a28-cdbc-79c9-8b96-47688bdabec3"
    );
    expect(text).toContain("page_module: team");
    expect(text).toContain("Do not claim you cannot see the current URL");
  });

  it("renders described app_context entries (Ch.7)", () => {
    const text = formatAgentUiStateHarnessInstructions(
      makeSnapshot({
        app_context: [
          {
            description: "The document the user is editing",
            value: { id: "d1", title: "Q4 plan" },
          },
          { description: "Active filter", value: "open" },
        ],
      })
    );

    expect(text).toContain(
      "What the user is looking at (app-provided context):"
    );
    expect(text).toContain(
      '- The document the user is editing: {"id":"d1","title":"Q4 plan"}'
    );
    // String values render verbatim (no JSON quoting).
    expect(text).toContain("- Active filter: open");
  });

  it("omits the app_context section when there are no entries", () => {
    const text = formatAgentUiStateHarnessInstructions(makeSnapshot());
    expect(text).not.toContain("app-provided context");
  });

  it("renders shared state with the set_state hint (Ch.6)", () => {
    const text = formatAgentUiStateHarnessInstructions(
      makeSnapshot({ shared: { plan: { steps: ["a"] }, filter: "open" } })
    );
    expect(text).toContain("use the `set_state` tool to update a key");
    expect(text).toContain('- plan: {"steps":["a"]}');
    expect(text).toContain('- filter: "open"');
  });

  it("omits the shared-state section when empty", () => {
    expect(
      formatAgentUiStateHarnessInstructions(makeSnapshot({ shared: {} }))
    ).not.toContain("set_state");
  });
});

describe("buildAgentSystemPromptFromUiState", () => {
  afterEach(() => {
    unregisterAiRegistration("tasks");
  });

  it("invokes registered build_system_prompt from AG-UI page state", async () => {
    registerAiRegistration({
      module_id: "tasks",
      agents: [
        {
          build_system_prompt: async ({ context }) => {
            const snapshot = context?.task_snapshot;
            return snapshot
              ? `Task preload: ${JSON.stringify(snapshot)}`
              : "No task preload";
          },
          build_tools: () => ({}),
          id: "tasks.assist",
          instruction_keys: [],
          module_id: "tasks",
          name: "Tasks Assist",
        },
      ],
    });

    const prompt = await buildAgentSystemPromptFromUiState(
      "tasks.assist",
      makeSnapshot({
        page: {
          task_snapshot: {
            identifier: "ENG-1",
            title: "Ship tasks module",
            status: "in_progress",
          },
        },
        selection: { entity_id: "task-1", entity_type: "task" },
      })
    );

    expect(prompt).toContain("Task preload:");
    expect(prompt).toContain("Ship tasks module");
  });

  it("returns empty string when agent has no builder", async () => {
    const prompt = await buildAgentSystemPromptFromUiState(
      "unknown.agent",
      makeSnapshot()
    );
    expect(prompt).toBe("");
  });
});
