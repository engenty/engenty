/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopilotAgentSessionChooser } from "./copilot-agent-session-chooser.js";

afterEach(() => {
  cleanup();
});

describe("CopilotAgentSessionChooser", () => {
  it("renders the trigger with the select-agent label", () => {
    render(
      <CopilotAgentSessionChooser
        agents={[{ id: "a1", name: "Agent One" }]}
        emptySessionsLabel="Empty"
        menuAgentId={null}
        menuSessions={[]}
        newSessionLabel="New sess"
        onNewSessionForAgent={vi.fn()}
        onRequestAgentSessions={vi.fn()}
        onResumeSession={vi.fn()}
        onSelectAgent={vi.fn()}
        selectAgentLabel="Pick agent"
        selectedAgentId={null}
        sessionsSectionLabel="Past"
      />
    );

    expect(screen.getByRole("button", { name: /pick agent/i })).toBeTruthy();
  });

  it("opens the root menu and lists agents (Radix + user-event)", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(
      <CopilotAgentSessionChooser
        agents={[{ id: "a1", name: "Agent One" }]}
        emptySessionsLabel="Empty"
        menuAgentId={null}
        menuSessions={[]}
        newSessionLabel="New sess"
        onNewSessionForAgent={vi.fn()}
        onRequestAgentSessions={vi.fn()}
        onResumeSession={vi.fn()}
        onSelectAgent={vi.fn()}
        selectAgentLabel="Pick"
        selectedAgentId={null}
        sessionsSectionLabel="Past"
      />
    );

    await user.click(screen.getByRole("button", { name: /pick/i }));
    expect(screen.getByRole("menuitem", { name: /agent one/i })).toBeTruthy();
  });
});
