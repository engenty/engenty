/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
// ai-ui unit tests run without an i18n backend, so `t()` yields the key —
// assert on those rather than on copy that only exists in the locale files.
import { AgentDeskActions } from "./agent-desk-actions.js";

const developerMode = { enabled: false };
const openInspector = vi.fn();

vi.mock("../../components/ag-ui-inspector/ag-ui-inspector-hooks.js", () => ({
  useDeveloperModeEnabled: () => developerMode.enabled,
}));
vi.mock("../../components/ag-ui-inspector/ag-ui-inspector-widget.js", () => ({
  openAgUiAgentInspector: () => openInspector(),
}));

vi.mock(
  "../../components/copilot/thread-context/thread-context-toggle.js",
  () => ({
    ThreadContextToggle: () => null,
  })
);
vi.mock("../../artifacts/workspace-artifact-pane.js", () => ({
  ArtifactPaneToggle: () => null,
}));

function renderActions(overrides: {
  agentId: string;
  canAssignWork: boolean;
  canManage: boolean;
  isCustomAgent?: boolean;
}) {
  render(
    <MemoryRouter>
      <AgentDeskActions
        agentId={overrides.agentId}
        agentName="Researcher"
        canAsk
        canAssignWork={overrides.canAssignWork}
        canManage={overrides.canManage}
        hostKey={`agent-desk:space-1:${overrides.agentId}`}
        isCustomAgent={overrides.isCustomAgent ?? false}
        locale="en"
        onOpenDm={() => {
          // no-op
        }}
        onOpenPanel={() => {
          // no-op
        }}
        spaceId="space-1"
        spaceKey="company"
        threadId={null}
      />
    </MemoryRouter>
  );
}

function openOverflowMenu() {
  fireEvent.click(
    screen.getByRole("button", { name: "agentDesk.actions.menuLabel" })
  );
}

describe("AgentDeskActions", () => {
  afterEach(() => {
    cleanup();
    developerMode.enabled = false;
    openInspector.mockReset();
  });

  it("shows no assign-work button and hides manage for module agents", () => {
    renderActions({
      agentId: "invoices.manager",
      canAssignWork: true,
      canManage: false,
    });

    // Assign work waits on the tasks module contributing it via a UI hook.
    expect(
      screen.queryByRole("button", { name: "agentDesk.actions.assignWork" })
    ).toBeNull();

    openOverflowMenu();
    // The desk is one long conversation: no "new chat" anywhere. A private
    // word is the DM, in the menu.
    expect(screen.queryByText("agentDesk.actions.newChat")).toBeNull();
    expect(screen.getByText("agentDesk.actions.openDm")).toBeTruthy();
    expect(screen.queryByText("agentDesk.actions.manageAgent")).toBeNull();
    // Adding a routine follows the same permission as assigning work.
    expect(screen.getByText("agentDesk.actions.addRoutine")).toBeTruthy();
  });

  it("offers the admin screens in the overflow menu for tenant-owned agents", () => {
    renderActions({
      agentId: "custom.researcher",
      canAssignWork: false,
      canManage: true,
      isCustomAgent: true,
    });

    expect(
      screen.queryByRole("button", { name: "agentDesk.actions.assignWork" })
    ).toBeNull();
    // Manage moved off the action row and into the menu.
    expect(
      screen.queryByRole("button", { name: "agentDesk.actions.manageAgent" })
    ).toBeNull();

    openOverflowMenu();
    expect(screen.getByText("agentDesk.actions.manageAgent")).toBeTruthy();
    expect(screen.getByText("agentDesk.actions.capabilities")).toBeTruthy();
    expect(screen.getByText("agentDesk.actions.editAgent")).toBeTruthy();
    expect(screen.queryByText("agentDesk.actions.addRoutine")).toBeNull();
  });

  it("hides the edit item for agents without an edit form", () => {
    renderActions({
      agentId: "invoices.manager",
      canAssignWork: false,
      canManage: true,
      isCustomAgent: false,
    });

    openOverflowMenu();
    expect(screen.getByText("agentDesk.actions.manageAgent")).toBeTruthy();
    expect(screen.queryByText("agentDesk.actions.editAgent")).toBeNull();
  });

  it("opens the AG-UI inspector from the overflow menu in developer mode", () => {
    developerMode.enabled = true;
    renderActions({
      agentId: "engenty.copilot",
      canAssignWork: false,
      canManage: false,
    });
    openOverflowMenu();
    fireEvent.click(screen.getByText("agentDesk.actions.openInspector"));
    expect(openInspector).toHaveBeenCalledOnce();
  });
});
