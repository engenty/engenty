/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopilotAgentThreadChooser } from "./copilot-agent-thread-chooser.js";

afterEach(() => {
  cleanup();
});

describe("CopilotAgentThreadChooser", () => {
  it("renders the trigger with the select-agent label", () => {
    render(
      <CopilotAgentThreadChooser
        agents={[{ id: "a1", name: "Agent One" }]}
        emptyThreadsLabel="Empty"
        menuAgentId={null}
        menuThreads={[]}
        newThreadLabel="New sess"
        onNewThreadForAgent={vi.fn()}
        onRequestAgentThreads={vi.fn()}
        onResumeThread={vi.fn()}
        onSelectAgent={vi.fn()}
        selectAgentLabel="Pick agent"
        selectedAgentId={null}
        threadsSectionLabel="Past"
      />
    );

    expect(screen.getByRole("button", { name: /pick agent/i })).toBeTruthy();
  });

  it("opens the root menu and lists agents (Radix + user-event)", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(
      <CopilotAgentThreadChooser
        agents={[{ id: "a1", name: "Agent One" }]}
        emptyThreadsLabel="Empty"
        menuAgentId={null}
        menuThreads={[]}
        newThreadLabel="New sess"
        onNewThreadForAgent={vi.fn()}
        onRequestAgentThreads={vi.fn()}
        onResumeThread={vi.fn()}
        onSelectAgent={vi.fn()}
        selectAgentLabel="Pick"
        selectedAgentId={null}
        threadsSectionLabel="Past"
      />
    );

    await user.click(screen.getByRole("button", { name: /pick/i }));
    expect(screen.getByRole("menuitem", { name: /agent one/i })).toBeTruthy();
  });
});
