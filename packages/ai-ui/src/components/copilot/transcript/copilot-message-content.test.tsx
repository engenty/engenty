/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { registerDefaultToolCallUiCards } from "../tool-call/tool-call-ui-defaults.js";
import { CopilotMessageContent } from "./copilot-message-content.js";

registerDefaultToolCallUiCards();

describe("CopilotMessageContent sub-agent delegations", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders agent-* tools as expandable cards outside the thought block", () => {
    render(
      <MemoryRouter>
        <CopilotMessageContent
          messages={[{ id: "assistant-1" }]}
          msg={{
            id: "assistant-1",
            role: "assistant",
            parts: [
              {
                type: "reasoning",
                text: "Brief planning",
                state: "done",
              },
              {
                type: "dynamic-tool",
                toolCallId: "sub-1",
                toolName: "agent-engenty_cli",
                state: "output-available",
                input: { task: "date" },
                output: { summary: "Done" },
              },
              {
                type: "text",
                text: "Sun Jun 7 06:13:19 UTC 2026",
              },
            ],
          }}
          status="ready"
          subAgentFullViewLabel="Full view"
          threadId="thread-1"
        />
      </MemoryRouter>
    );

    expect(screen.getByText("CLI Agent")).toBeTruthy();
    expect(screen.getByText("Sub-agent run")).toBeTruthy();

    fireEvent.click(screen.getByTestId("sub-agent-header-trigger"));
    expect(
      screen.getByRole("link", { name: "Full view" }).getAttribute("href")
    ).toBe("/mdl/engenty-copilot/chat/thread-1?subRun=sub-1");
  });
});

describe("CopilotMessageContent tool timeline", () => {
  afterEach(() => {
    cleanup();
  });

  it("labels the running tool timeline as tool use and ignores reasoning parts", () => {
    render(
      <MemoryRouter>
        <CopilotMessageContent
          messages={[{ id: "assistant-1" }]}
          msg={{
            id: "assistant-1",
            role: "assistant",
            parts: [
              // Reasoning is parked: it has no renderer and must not appear.
              { type: "reasoning", text: "Decide the query.", state: "done" },
              {
                type: "dynamic-tool",
                toolCallId: "ws-1",
                toolName: "web_search",
                state: "input-available",
                input: { query: "engenty docs" },
              },
            ],
          }}
          status="streaming"
        />
      </MemoryRouter>
    );

    // The running web search renders in the (open) tool timeline.
    expect(screen.getByText("Search: engenty docs")).toBeTruthy();
    // The header reads as tool use, not the generic "Thinking…".
    expect(screen.getByText("Working…")).toBeTruthy();
    // Reasoning is not rendered anywhere (no accordion, no chain step).
    expect(screen.queryByText("Decide the query.")).toBeNull();
    expect(screen.queryByText("Thinking")).toBeNull();
  });
});

describe("CopilotMessageContent generic tool step", () => {
  afterEach(() => {
    cleanup();
  });

  it("surfaces the resolved metadata as the step description", () => {
    render(
      <MemoryRouter>
        <CopilotMessageContent
          messages={[{ id: "assistant-1" }]}
          msg={{
            id: "assistant-1",
            role: "assistant",
            parts: [
              {
                type: "dynamic-tool",
                toolCallId: "u1",
                toolName: "phases_update",
                state: "input-available",
                input: { id: "p1", data: { title: "Unterlagen" } },
                displayLabel: 'Updated "Unterlagen"',
                metadata: "phases",
              },
            ],
          }}
          status="streaming"
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Updated "Unterlagen"')).toBeTruthy();
    // The secondary descriptor (scope) the label drops is now shown.
    expect(screen.getByText("phases")).toBeTruthy();
  });
});

describe("CopilotMessageContent rich tool step content", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a tool image with caption and an output snippet in the timeline", () => {
    render(
      <MemoryRouter>
        <CopilotMessageContent
          messages={[{ id: "assistant-1" }]}
          msg={{
            id: "assistant-1",
            role: "assistant",
            parts: [
              {
                type: "dynamic-tool",
                toolCallId: "img-1",
                toolName: "fetch_profile",
                state: "output-available",
                input: { name: "Hayden Bleasel" },
                output: {
                  image_url: "https://x.com/avatar.png",
                  caption: "Profile photo from x.com",
                  text: "Hayden Bleasel is an Australian product designer.",
                },
              },
              { type: "text", text: "Here is what I found." },
            ],
          }}
          status="ready"
        />
      </MemoryRouter>
    );

    // Completed runs collapse the timeline; expand it to reveal the step bodies.
    fireEvent.click(screen.getByText("Used 1 tool"));

    const images = screen.getAllByRole("img", {
      name: "Profile photo from x.com",
    });
    const image = images.find((el) => el.tagName === "IMG") ?? images[0];
    expect(image.getAttribute("src")).toBe("https://x.com/avatar.png");
    expect(
      screen.getAllByAltText("Profile photo from x.com").length
    ).toBeGreaterThan(0);
    expect(
      screen.getByText("Hayden Bleasel is an Australian product designer.")
    ).toBeTruthy();
  });
});

describe("CopilotMessageContent error-shaped tool output", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders an error step (not a green check) when output is a validation error", () => {
    render(
      <MemoryRouter>
        <CopilotMessageContent
          messages={[{ id: "assistant-1" }]}
          msg={{
            id: "assistant-1",
            role: "assistant",
            parts: [
              {
                type: "dynamic-tool",
                toolCallId: "open-1",
                toolName: "inbox_open",
                state: "output-available",
                displayLabel: "Opened",
                input: {},
                output: [
                  {
                    expected: "string",
                    code: "invalid_type",
                    path: ["inbox_id"],
                    message:
                      "Invalid input: expected string, received undefined",
                  },
                ],
              },
              { type: "text", text: "Done." },
            ],
          }}
          status="ready"
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText("Used 1 tool"));
    expect(
      screen.getByText("Invalid input: expected string, received undefined")
    ).toBeTruthy();
  });
});

describe("CopilotMessageContent docked decision suppression", () => {
  afterEach(() => {
    cleanup();
  });

  const decisionMsg = {
    id: "assistant-1",
    role: "assistant",
    parts: [
      {
        type: "dynamic-tool",
        toolCallId: "decision-1",
        toolName: "requestDecision",
        state: "input-available",
        input: {},
        output: {
          artifact_id: "artifact-1",
          artifact_type: "decision",
          choices: [{ id: "a", label: "Open team page" }],
          interrupt_id: "artifact-1",
          title: "Open the team page?",
        },
      },
    ],
  } as const;

  it("renders the chooser inline when it is not docked", () => {
    render(
      <MemoryRouter>
        <CopilotMessageContent
          messages={[{ id: "assistant-1" }]}
          msg={decisionMsg}
          status="ready"
        />
      </MemoryRouter>
    );

    expect(screen.getByText("Open the team page?")).toBeTruthy();
  });

  it("suppresses the inline chooser when its tool call id is docked", () => {
    render(
      <MemoryRouter>
        <CopilotMessageContent
          dockedInterruptToolCallId="decision-1"
          messages={[{ id: "assistant-1" }]}
          msg={decisionMsg}
          status="ready"
        />
      </MemoryRouter>
    );

    expect(screen.queryByText("Open the team page?")).toBeNull();
  });
});

describe("CopilotMessageContent object renders", () => {
  afterEach(() => {
    cleanup();
  });

  const showObjectsMsg = {
    id: "assistant-1",
    role: "assistant",
    parts: [
      {
        type: "dynamic-tool",
        toolCallId: "obj-1",
        toolName: "show_objects",
        state: "output-available",
        input: { refs: ["contacts:contact:c-1"] },
        output: {
          ok: true,
          _meta: {
            engenty: {
              object_render: {
                refs: ["contacts:contact:c-1"],
                display: "inline",
                items: [{ ref: "contacts:contact:c-1", title: "Ada Lovelace" }],
              },
            },
          },
        },
      },
      { type: "text", text: "Here are your contacts." },
    ],
  };

  // Regression: object cards used to be folded into the collapsed "Used N
  // tools" timeline because they resolved before the closing text part.
  it("renders the object card outside the collapsed tool timeline", () => {
    render(
      <MemoryRouter>
        <CopilotMessageContent
          messages={[{ id: "assistant-1" }]}
          msg={showObjectsMsg}
          status="ready"
        />
      </MemoryRouter>
    );

    // Fallback card (no module widget registered in this suite) renders the
    // snapshot title without expanding any timeline.
    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
    expect(screen.queryByText("Used 1 tool")).toBeNull();
  });
});
