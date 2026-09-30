/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setTestLocale } from "../../../../locales/test-translation.js";
import { AgentStatusTicker } from "./agent-status-ticker.js";

vi.mock(
  "@engenty/i18n/ui",
  () => import("../../../../locales/test-translation.js")
);

afterEach(() => {
  cleanup();
});

describe("AgentStatusTicker", () => {
  it("expands to show recent tool steps", () => {
    render(
      <AgentStatusTicker
        chatStatus="streaming"
        messages={[
          {
            role: "assistant",
            parts: [
              {
                type: "dynamic-tool",
                state: "output-available",
                toolCallId: "tc-1",
                toolName: "search_contacts",
                input: {},
                output: {},
              },
              {
                type: "dynamic-tool",
                state: "input-available",
                toolCallId: "tc-2",
                toolName: "navigate",
                input: {},
              },
            ],
          },
        ]}
      />
    );

    expect(screen.getByText(/navigate/)).toBeTruthy();
    expect(screen.queryByText(/search_contacts/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show recent steps" }));

    expect(screen.getByText(/search_contacts/)).toBeTruthy();
  });

  it("says what the run is doing in the person's language", () => {
    setTestLocale("de");
    try {
      render(<AgentStatusTicker chatStatus="submitted" messages={[]} />);
      expect(screen.getByText("Wartet…")).toBeTruthy();
    } finally {
      setTestLocale("en");
    }
  });
});
