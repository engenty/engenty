/**
 * @vitest-environment happy-dom
 */
import type { AgentDeskAgent } from "@engenty/ai-core/browser";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentManagePanel } from "./agent-manage-panel.js";

vi.mock("../../lib/admin/ai-runtime-queries.js", () => ({
  useUpdateCustomAgentMutation: () => ({
    isError: false,
    mutate: vi.fn(),
  }),
}));
vi.mock("./agent-work-sections.js", () => ({
  AgentWorkSections: () => null,
}));
vi.mock("./agent-runs-panel.js", () => ({
  AgentRecentRuns: () => null,
}));
vi.mock("../agents-workspace/agent-connections-panel.js", () => ({
  AgentConnectionsPanel: () => null,
}));
vi.mock("./use-agent-memory.js", () => ({
  useAgentMemoryQuery: () => ({ data: { content: "" }, isPending: false }),
  useSaveAgentMemoryMutation: () => ({ isPending: false, mutate: vi.fn() }),
}));
vi.mock("../../lib/admin/instruction-settings-queries.js", () => ({
  useAiInstructionResolutionQuery: () => ({
    data: {
      base_document: { body: "# Role" },
      effective_document: null,
      tenant_override: null,
    },
    isError: false,
  }),
  useResetAiInstructionMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useUpdateAiInstructionMutation: () => ({
    error: null,
    isError: false,
    isPending: false,
    mutate: vi.fn(),
  }),
}));
vi.mock("./use-agent-tasks.js", () => ({
  useAgentTasksQuery: () => ({ data: { tasks: "" }, isPending: false }),
  useSaveAgentTasksMutation: () => ({ isPending: false, mutate: vi.fn() }),
}));

const moduleAgent: AgentDeskAgent = {
  can_assign_work: true,
  can_ask: true,
  connectors: [],
  description: "Read and triage the synced inbox.",
  engenty: "drop",
  id: "inbox.assist",
  managed_by_module: "inbox",
  model: "openai/gpt-5.6",
  name: "Inbox Assist",
  role: "specialist",
  skills: [],
  source: "module",
  starters: [],
};

const customAgent: AgentDeskAgent = {
  ...moduleAgent,
  id: "wizard-smoke",
  managed_by_module: null,
  name: "Wizard Smoke",
  source: "database",
};

function renderPanel(agent: AgentDeskAgent, moduleLabel?: string) {
  return render(
    <MemoryRouter>
      <AgentManagePanel
        agent={agent}
        canEditPads
        canManage
        moduleLabel={moduleLabel}
        spaceId="space-1"
      />
    </MemoryRouter>
  );
}

describe("AgentManagePanel identity", () => {
  afterEach(() => {
    cleanup();
  });

  it("puts the named module pill after the name, not Specialist/Custom badges", () => {
    renderPanel(moduleAgent, "Inbox");

    expect(screen.getByRole("heading", { name: "Inbox Assist" })).toBeTruthy();
    expect(screen.getByText("Inbox")).toBeTruthy();
    expect(screen.queryByText("agentsCatalog.role.specialist")).toBeNull();
    expect(screen.queryByText("agentsCatalog.source.custom")).toBeNull();
    expect(screen.queryByText("agentsCatalog.source.module")).toBeNull();
  });

  it("omits the module pill on a custom agent", () => {
    renderPanel(customAgent, "Inbox");

    expect(screen.getByText("Wizard Smoke")).toBeTruthy();
    expect(screen.queryByText("Inbox")).toBeNull();
  });
});
