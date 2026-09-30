/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SubAgentTaskToolCallCard } from "../sub-agent-task-tool-call-card.js";

describe("SubAgentTaskToolCallCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("opens and closes the run details from the header", () => {
    render(
      <SubAgentTaskToolCallCard
        input={{ task: "List contacts" }}
        output={{ summary: "Listed 3 contacts", status: "success" }}
        state="completed"
        toolName="agent-engenty_tools"
      />
    );

    const header = screen.getByRole("button", { expanded: false });
    fireEvent.click(header);
    expect(header.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(header);
    expect(header.getAttribute("aria-expanded")).toBe("false");
  });
});
