/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HOST_MESSAGE_HANDOFF_STATE } from "../../copilot/host-message-handoff.js";
import { AgentDesk } from "./agent-desk.js";
import { useAgentDeskFeed } from "./use-agent-desk-feed.js";

vi.mock("@engenty/ui-plugin-sdk", () => ({ usePageConfig: vi.fn() }));
vi.mock("./conversation-api.js", () => ({
  useOpenDmMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useSpaceConversationsQuery: () => ({ data: undefined }),
}));
vi.mock("./use-agent-desk-feed.js", () => ({
  useAgentDeskFeed: vi.fn(),
}));

const capturedChat = vi.fn();
vi.mock("../../artifacts/workspace-artifact-pane.js", () => ({
  ArtifactPaneToggle: () => null,
  WorkspaceArtifactPane: () => null,
}));
vi.mock(
  "../../components/copilot/thread-context/thread-context-pane.js",
  () => ({
    ThreadContextPane: ({
      children,
      header,
    }: {
      children: React.ReactNode;
      header?: React.ReactNode;
    }) => (
      <>
        {header}
        {children}
      </>
    ),
  })
);
vi.mock("./agent-desk-chat.js", () => ({
  AgentDeskChat: (props: { pendingSubmit?: string | null }) => {
    capturedChat(props);
    return <div>Agent chat surface</div>;
  },
}));

const mockedFeed = vi.mocked(useAgentDeskFeed);

function renderDesk() {
  return render(
    <MemoryRouter initialEntries={["/s/company/agents/custom.researcher"]}>
      <AgentDesk
        agentId="custom.researcher"
        canManageAgents
        spaceId="space-1"
        spaceKey="company"
      />
    </MemoryRouter>
  );
}

function feed(
  role: "copilot" | "specialist" | "coordinator",
  managedBy: string | null = null
) {
  return {
    data: {
      agent: {
        can_assign_work: true,
        can_ask: true,
        connectors: [],
        description: "Finds useful evidence.",
        engenty: "drop",
        id: "custom.researcher",
        managed_by_module: managedBy,
        model: "openai/gpt-5.6",
        name: "Researcher",
        role,
        skills: [],
        source: managedBy ? ("module" as const) : ("database" as const),
        starters: [],
      },
      engagements: [],
      lane_counts: {
        active: 0,
        assigned: 0,
        completed: 0,
        conversation: 0,
        waiting: 0,
      },
      next_cursor: null,
      space_id: "space-1",
    },
    isError: false,
    isPending: false,
  } as unknown as ReturnType<typeof useAgentDeskFeed>;
}

describe("AgentDesk", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("opens a specialist on the Copilot chat surface even when it is new", () => {
    mockedFeed.mockReturnValue(feed("specialist"));
    renderDesk();

    expect(screen.getByText("Agent chat surface")).toBeTruthy();
    expect(screen.queryByText("No work here yet")).toBeNull();
  });

  it("opens Copilot on its conversation surface even when it is new", () => {
    mockedFeed.mockReturnValue(feed("copilot"));
    renderDesk();

    expect(screen.getByText("Agent chat surface")).toBeTruthy();
  });

  it("opens a coordinator-role agent on chat, not a briefing list", () => {
    mockedFeed.mockReturnValue(feed("coordinator"));
    render(
      <MemoryRouter initialEntries={["/s/company/agents/engenty.coordinator"]}>
        <AgentDesk
          agentId="engenty.coordinator"
          canManageAgents
          spaceId="space-1"
          spaceKey="company"
        />
      </MemoryRouter>
    );

    expect(screen.getByText("Agent chat surface")).toBeTruthy();
    expect(screen.queryByText("No work here yet")).toBeNull();
  });

  it("hands a parked home message to a new coordinator-role chat", () => {
    mockedFeed.mockReturnValue(feed("coordinator"));
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/s/company/agents/engenty.coordinator",
            search: "?action=ask",
            state: { [HOST_MESSAGE_HANDOFF_STATE]: "Hi" },
          },
        ]}
      >
        <AgentDesk
          agentId="engenty.coordinator"
          canManageAgents
          spaceId="space-1"
          spaceKey="company"
        />
      </MemoryRouter>
    );

    expect(capturedChat).toHaveBeenCalledWith(
      expect.objectContaining({ pendingSubmit: "Hi" })
    );
  });

  it("renders unknown or unmounted feed failures", () => {
    mockedFeed.mockReturnValue({
      error: new Error("agent_desk.agent_not_mounted"),
      isError: true,
      isPending: false,
    } as ReturnType<typeof useAgentDeskFeed>);
    renderDesk();

    expect(screen.getByText("agent_desk.agent_not_mounted")).toBeTruthy();
  });
});
