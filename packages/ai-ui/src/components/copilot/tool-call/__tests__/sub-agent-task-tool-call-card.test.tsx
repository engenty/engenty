/**
 * @vitest-environment happy-dom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { SubAgentTaskToolCallCard } from "../sub-agent-task-tool-call-card.js";

describe("SubAgentTaskToolCallCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a dedicated running widget with progress log", () => {
    render(
      <SubAgentTaskToolCallCard
        input={{ task: "List contacts" }}
        progressLines={["Searching catalog…", "Running contacts_list"]}
        state="running"
        toolName="agent-engenty_tools"
      />
    );

    expect(screen.getByText("Engenty Tools")).toBeTruthy();
    expect(screen.getByText("Running")).toBeTruthy();
    const expandedShell = screen.getByTestId("sub-agent-expanded-shell");
    expect(expandedShell.getAttribute("data-collapsed")).toBe("false");
    expect(within(expandedShell).getByText("Input")).toBeTruthy();
    expect(within(expandedShell).getByText("Output")).toBeTruthy();
    expect(within(expandedShell).getByText("Log")).toBeTruthy();
    expect(within(expandedShell).getByText("List contacts")).toBeTruthy();
    expect(within(expandedShell).getByText("Searching catalog…")).toBeTruthy();
    expect(
      within(expandedShell).getByText("Running contacts_list")
    ).toBeTruthy();
  });

  it("shows complete state when output exists even if wire state is running", () => {
    render(
      <SubAgentTaskToolCallCard
        input={{ task: "date" }}
        output={{ summary: "Done", status: "success" }}
        state="running"
        toolName="agent-engenty_cli"
      />
    );

    expect(screen.getByText("Complete")).toBeTruthy();
    expect(screen.queryByText("Running")).toBeNull();
    expect(
      within(screen.getByTestId("sub-agent-preview-shell")).getByText("Done")
    ).toBeTruthy();
    expect(
      screen
        .getByTestId("sub-agent-expanded-shell")
        .getAttribute("data-collapsed")
    ).toBe("true");

    fireEvent.click(screen.getByTestId("sub-agent-header-trigger"));

    const outputHeader = within(
      screen.getByTestId("sub-agent-expanded-shell")
    ).getByText("Output");
    const outputPanel = outputHeader.parentElement?.parentElement;
    expect(outputPanel).toBeTruthy();
    expect(within(outputPanel as HTMLElement).getByText(/Done/)).toBeTruthy();
  });

  it("collapses completed runs to header and one input preview line", () => {
    render(
      <SubAgentTaskToolCallCard
        input={{ task: "Run the CLI command 'date' and return the output." }}
        output={{ summary: "Done", status: "success" }}
        state="completed"
        toolName="agent-engenty_cli"
      />
    );

    const preview = within(screen.getByTestId("sub-agent-preview-shell"));
    expect(preview.getByText("Done")).toBeTruthy();
    expect(
      preview.queryByText("Run the CLI command 'date' and return the output.")
    ).toBeNull();
    expect(
      screen
        .getByTestId("sub-agent-expanded-shell")
        .getAttribute("data-collapsed")
    ).toBe("true");
    expect(
      screen
        .getByTestId("sub-agent-preview-shell")
        .getAttribute("data-collapsed")
    ).toBe("false");
  });

  it("toggles expanded details from the header trigger", () => {
    render(
      <SubAgentTaskToolCallCard
        input={{ task: "List contacts" }}
        output={{ summary: "Listed 3 contacts", status: "success" }}
        state="completed"
        toolName="agent-engenty_tools"
      />
    );

    fireEvent.click(screen.getByTestId("sub-agent-header-trigger"));
    const expandedShell = screen.getByTestId("sub-agent-expanded-shell");
    expect(expandedShell.getAttribute("data-collapsed")).toBe("false");
    expect(within(expandedShell).getByText("Output")).toBeTruthy();
    expect(within(expandedShell).getByText("Log")).toBeTruthy();

    fireEvent.click(screen.getByTestId("sub-agent-header-trigger"));
    expect(expandedShell.getAttribute("data-collapsed")).toBe("true");
  });

  it("opens expanded details when the collapsed summary line is clicked", () => {
    render(
      <SubAgentTaskToolCallCard
        input={{ task: "Run diagnostics" }}
        output={{
          status: "success",
          summary: "Ran 5 diagnostic commands in the CLI sandbox.",
        }}
        state="completed"
        toolName="agent-engenty_cli"
      />
    );

    fireEvent.click(screen.getByTestId("sub-agent-preview-trigger"));
    expect(
      screen
        .getByTestId("sub-agent-expanded-shell")
        .getAttribute("data-collapsed")
    ).toBe("false");
  });

  it("renders failed state", () => {
    render(
      <SubAgentTaskToolCallCard
        errorText="Delegation failed"
        state="error"
        toolName="agent-engenty_tools"
      />
    );

    expect(screen.getByText("Failed")).toBeTruthy();
    expect(
      within(screen.getByTestId("sub-agent-expanded-shell")).getByText(
        "Delegation failed"
      )
    ).toBeTruthy();
  });

  it("shows truncated error preview in danger color when collapsed", () => {
    render(
      <SubAgentTaskToolCallCard
        errorText="Sandbox unavailable for this tenant"
        state="error"
        toolName="agent-engenty_cli"
      />
    );

    fireEvent.click(screen.getByTestId("sub-agent-header-trigger"));

    const previewLine = within(
      screen.getByTestId("sub-agent-preview-shell")
    ).getByText("Sandbox unavailable for this tenant");
    expect(previewLine.className).toContain("text-destructive");
  });

  it("renders full-page monitor link when href is provided", () => {
    render(
      <MemoryRouter>
        <SubAgentTaskToolCallCard
          fullPageHref="/mdl/engenty-copilot/chat/thread-1?subRun=call-1"
          fullPageLabel="Vollansicht"
          progressLines={["pwd"]}
          state="running"
          toolCallId="call-1"
          toolName="agent-engenty_cli"
        />
      </MemoryRouter>
    );

    const link = screen.getByRole("link", { name: /Vollansicht/i });
    expect(link.getAttribute("href")).toBe(
      "/mdl/engenty-copilot/chat/thread-1?subRun=call-1"
    );
  });
});
