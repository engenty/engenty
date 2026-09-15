/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThreadContextPane } from "./thread-context-pane.js";

vi.mock("../../../agent-provider/engenty-agent.js", () => ({
  useOptionalAgentHostByKey: () => null,
}));
vi.mock("../../../artifacts/artifacts-api.js", () => ({
  useArtifactsListQuery: () => ({ data: [] }),
}));
vi.mock("../../../lib/admin/effective-capabilities-api.js", () => ({
  useAgentEffectiveCapabilitiesQuery: () => ({ data: undefined }),
}));
vi.mock("../../../features/agent-desk/use-agent-memory.js", () => ({
  useAgentMemoryQuery: () => ({ data: undefined }),
}));
vi.mock("../../../lib/admin/agent-workspace-queries.js", () => ({
  useWorkspaceTreeQuery: () => ({ data: undefined }),
}));

describe("ThreadContextPane", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the chat without CopilotThreadBindingProvider", () => {
    render(
      <ThreadContextPane
        hostKey="agent-desk:space-1:chief-of-staff"
        layout="column"
      >
        <div>desk chat</div>
      </ThreadContextPane>
    );
    expect(screen.getByText("desk chat")).toBeTruthy();
  });
});
