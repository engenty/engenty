/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import {
  CopilotMessageContent,
  chatBubbleBreaks,
} from "./copilot-message-content.js";
import { needsDateDivider } from "./transcript-date-divider.js";

function tool(
  toolCallId: string,
  toolName: string,
  input: unknown,
  output: unknown
) {
  return {
    input,
    output,
    state: "output-available",
    toolCallId,
    toolName,
    type: "dynamic-tool",
  };
}

const TURN = {
  id: "a1",
  parts: [
    tool("s1", "skill", { name: "getting-started" }, "# Getting started"),
    tool("d1", "ui_dom_snapshot", { root_selector: "main" }, { elements: [] }),
    tool(
      "n1",
      "navigate",
      { to: "/s/engrd/settings" },
      { output: { ok: true, to: "/s/engrd/settings" } }
    ),
    tool(
      "g1",
      "show_ui_guide",
      { title: "Weg 4" },
      { output: { ok: true, status: "resolved" } }
    ),
    tool(
      "g2",
      "show_ui_guide",
      { title: "Weg 5" },
      { output: { ok: true, status: "resolved" } }
    ),
    tool(
      "n2",
      "navigate",
      { to: "/s/engrd/data" },
      { output: { ok: false, error: "blocked" } }
    ),
    { text: "Fertig.", type: "text" },
  ],
  role: "assistant",
};

function renderTurn(toolDetail: "developer" | "person") {
  render(
    <MemoryRouter>
      <CopilotMessageContent isLastMessage msg={TURN} toolDetail={toolDetail} />
    </MemoryRouter>
  );
}

describe("CopilotMessageContent for a person", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows clips for what changed, folds a tour, and keeps the rest silent", () => {
    renderTurn("person");
    const clips = screen.getAllByTestId("tool-clip");
    // navigate → one clip linking the page; two guides → one folded line;
    // skill, snapshot and the failed navigate → nothing.
    expect(clips).toHaveLength(2);
    expect(clips[0]?.getAttribute("href")).toBe("/s/engrd/settings");
    expect(screen.queryByText(/Used \d tool/)).toBeNull();
    expect(screen.getByText("Fertig.")).toBeTruthy();
  });

  it("keeps the step list for a developer", () => {
    renderTurn("developer");
    expect(screen.getByText("Used 6 tools")).toBeTruthy();
  });
});

describe("needsDateDivider", () => {
  const at = (minutes: number) =>
    new Date(Date.UTC(2026, 8, 24, 9, minutes)).toISOString();

  it("marks a pick-up after more than half an hour", () => {
    expect(needsDateDivider(at(0), at(31))).toBe(true);
    expect(needsDateDivider(at(0), at(30))).toBe(false);
  });

  it("needs a message before it, and reads a message without a time as now", () => {
    expect(needsDateDivider(null, at(59))).toBe(false);
    expect(needsDateDivider(at(0), null, Date.parse(at(45)))).toBe(true);
  });
});

describe("chatBubbleBreaks", () => {
  const skill = tool("s", "skill", { name: "x" }, "# x");
  const nav = tool(
    "n",
    "navigate",
    { to: "/s/k/data" },
    { output: { ok: true, to: "/s/k/data" } }
  );
  const said = { text: "Hier.", type: "text" };

  it("parts bubbles only at what a person sees", () => {
    expect(
      chatBubbleBreaks({ parts: [skill, said], role: "assistant" }, "person")
    ).toEqual({ above: false, below: false, words: true });
    expect(
      chatBubbleBreaks({ parts: [nav, said], role: "assistant" }, "person")
    ).toEqual({ above: true, below: false, words: true });
    expect(
      chatBubbleBreaks({ parts: [skill, said], role: "assistant" }, "developer")
    ).toEqual({ above: true, below: false, words: true });
  });

  it("draws clips above the words wherever the call sits in the turn", () => {
    expect(
      chatBubbleBreaks({ parts: [said, nav], role: "assistant" }, "person")
    ).toEqual({ above: true, below: false, words: true });
  });

  it("stands apart on both sides when a row shows no text", () => {
    expect(
      chatBubbleBreaks({ parts: [nav], role: "assistant" }, "person")
    ).toEqual({ above: true, below: true, words: false });
  });
});
