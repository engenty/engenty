/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AgentStatusTicker } from "./agent-status-ticker.js";

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
        statusOnly
      />
    );

    expect(screen.getByText(/navigate/)).toBeTruthy();
    expect(screen.queryByText(/search_contacts/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show recent steps" }));

    expect(screen.getByText(/search_contacts/)).toBeTruthy();
  });

  it("does not show expand control for a single idle waiting label", () => {
    render(
      <AgentStatusTicker
        chatStatus="submitted"
        messages={[{ role: "user", parts: [{ type: "text", text: "hi" }] }]}
        statusOnly
      />
    );

    expect(screen.getByText("Waiting…")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Show recent steps" })
    ).toBeNull();
  });
});
