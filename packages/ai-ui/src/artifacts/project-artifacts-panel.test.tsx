/** @vitest-environment happy-dom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectArtifactsPanel } from "./project-artifacts-panel.js";

const useArtifactsListQuery = vi.fn(() => ({
  data: [
    {
      current_version: 2,
      id: "a1",
      scope_id: "p1",
      scope_type: "project",
      title: "Kickoff notes",
      type: "markdown",
      updated_at: "2026-07-13T10:00:00.000Z",
    },
  ],
  isLoading: false,
  isSuccess: true,
}));

vi.mock("./artifacts-api.js", () => ({
  useArtifactsListQuery: (scopeType: string, scopeId: string | null) =>
    useArtifactsListQuery(scopeType, scopeId),
}));

// The pane portals into shell slots and binds the copilot thread — out of
// scope here; the panel's contract is the project-filtered list.
vi.mock("./workspace-artifact-pane.js", () => ({
  WorkspaceArtifactPane: () => null,
}));

describe("ProjectArtifactsPanel", () => {
  it("lists via the ('project', projectId) scope and renders the rows", () => {
    render(<ProjectArtifactsPanel projectId="p1" />);

    expect(useArtifactsListQuery).toHaveBeenCalledWith("project", "p1");
    expect(screen.getByText("Kickoff notes")).toBeTruthy();
  });
});
