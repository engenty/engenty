/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setTestLocale } from "../../../locales/test-translation.js";
import { registerDefaultToolCallUiCards } from "../tool-call/tool-call-ui-defaults.js";
import { CopilotMessageContent } from "./copilot-message-content.js";

vi.mock(
  "@engenty/i18n/ui",
  () => import("../../../locales/test-translation.js")
);

registerDefaultToolCallUiCards();

describe("CopilotMessageContent sub-agent delegations", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows a delegation as its own card that links to the sub-run", () => {
    render(
      <MemoryRouter>
        <CopilotMessageContent
          isLastMessage
          msg={{
            id: "assistant-1",
            role: "assistant",
            parts: [
              {
                type: "dynamic-tool",
                toolCallId: "sub-1",
                toolName: "agent-engenty_cli",
                state: "output-available",
                input: { task: "date" },
                output: { summary: "Done" },
              },
              { type: "text", text: "Sun Jun 7 06:13:19 UTC 2026" },
            ],
          }}
          subAgentFullViewLabel="Full view"
          threadId="thread-1"
        />
      </MemoryRouter>
    );

    expect(screen.queryByText("Used 1 tool")).toBeNull();
    fireEvent.click(screen.getByTestId("sub-agent-header-trigger"));
    expect(screen.getByRole("link", { name: "Full view" })).toBeTruthy();
  });
});

describe("CopilotMessageContent tool timeline", () => {
  afterEach(() => {
    cleanup();
  });

  it("names the running step as the status line, steps one click away", () => {
    render(
      <MemoryRouter>
        <CopilotMessageContent
          isLastMessage
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
              },
            ],
          }}
          streaming
        />
      </MemoryRouter>
    );

    expect(screen.getAllByText('Updated "Unterlagen"')).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getAllByText('Updated "Unterlagen"')).toHaveLength(2);
  });

  // Between two tool calls the model is still working; the turn must not
  // read as finished.
  it("stays live between two tool calls and says it is thinking", () => {
    render(
      <MemoryRouter>
        <CopilotMessageContent
          isLastMessage
          msg={{
            id: "assistant-1",
            role: "assistant",
            parts: [
              {
                type: "dynamic-tool",
                toolCallId: "ws-1",
                toolName: "web_search",
                state: "output-available",
                input: { query: "engenty docs" },
                output: { results: [] },
              },
            ],
          }}
          streaming
        />
      </MemoryRouter>
    );
    expect(screen.getByText("Thinking…")).toBeTruthy();
    expect(screen.queryByText(/Worked for/)).toBeNull();
  });

  it("treats a step with output as done even when its state lags", () => {
    render(
      <MemoryRouter>
        <CopilotMessageContent
          isLastMessage
          msg={{
            id: "assistant-1",
            role: "assistant",
            parts: [
              {
                type: "dynamic-tool",
                toolCallId: "u1",
                toolName: "phases_update",
                state: "input-available",
                input: { id: "p1" },
                output: { ok: true },
                displayLabel: 'Updated "Unterlagen"',
              },
            ],
          }}
          streaming
        />
      </MemoryRouter>
    );
    expect(screen.getByText("Thinking…")).toBeTruthy();
    expect(screen.queryByText('Updated "Unterlagen"')).toBeNull();
  });

  it("closes the live line once answer text follows the tools", () => {
    render(
      <MemoryRouter>
        <CopilotMessageContent
          isLastMessage
          msg={{
            id: "assistant-1",
            role: "assistant",
            parts: [
              {
                type: "dynamic-tool",
                toolCallId: "ws-1",
                toolName: "web_search",
                state: "output-available",
                input: { query: "engenty docs" },
                output: { results: [] },
              },
              { type: "text", text: "Here is what I found." },
            ],
          }}
          streaming
        />
      </MemoryRouter>
    );
    expect(screen.queryByText("Thinking…")).toBeNull();
    expect(screen.getByText("Used 1 tool")).toBeTruthy();
  });

  it("names the tool list in the person's language", () => {
    setTestLocale("de");
    try {
      render(
        <MemoryRouter>
          <CopilotMessageContent
            isLastMessage
            msg={{
              id: "assistant-1",
              role: "assistant",
              parts: [
                {
                  type: "dynamic-tool",
                  toolCallId: "ws-1",
                  toolName: "web_search",
                  state: "output-available",
                  input: { query: "engenty docs" },
                  output: { results: [] },
                },
                { type: "text", text: "Hier ist, was ich gefunden habe." },
              ],
            }}
          />
        </MemoryRouter>
      );
      expect(screen.getByText("1 Tool verwendet")).toBeTruthy();
    } finally {
      setTestLocale("en");
    }
  });
});

describe("CopilotMessageContent tool list across text", () => {
  afterEach(() => {
    cleanup();
  });

  it("keeps tools after interim text in one expandable list, no raw output", () => {
    render(
      <MemoryRouter>
        <CopilotMessageContent
          isLastMessage
          msg={{
            id: "assistant-1",
            role: "assistant",
            parts: [
              {
                type: "dynamic-tool",
                toolCallId: "t1",
                toolName: "engenty_tools_search",
                state: "output-available",
                displayLabel: 'Searched "iban"',
                input: { query: "iban" },
                output: { matches: [] },
              },
              { type: "text", text: "Working…" },
              {
                type: "dynamic-tool",
                toolCallId: "t2",
                toolName: "engenty_tool_execute",
                state: "output-available",
                displayLabel: 'Searched "engrd"',
                input: { id: "contacts_search", input: { q: "engrd" } },
                // A stringified AG-UI result must not dump into the timeline.
                output: JSON.stringify({
                  ok: true,
                  data: {
                    results: [
                      {
                        item: {
                          match_reason: "semantic",
                          message: { body_html: "<html>…" },
                        },
                      },
                    ],
                  },
                }),
              },
            ],
          }}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText("Used 2 tools"));
    expect(screen.getByText('Searched "iban"')).toBeTruthy();
    expect(screen.getByText('Searched "engrd"')).toBeTruthy();
    expect(screen.queryByText(/"ok":true/)).toBeNull();
    expect(screen.queryByText(/body_html/)).toBeNull();
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
        <CopilotMessageContent isLastMessage msg={decisionMsg} />
      </MemoryRouter>
    );

    expect(screen.getByText("Open the team page?")).toBeTruthy();
  });

  it("suppresses the inline chooser when its tool call id is docked", () => {
    render(
      <MemoryRouter>
        <CopilotMessageContent
          dockedInterruptToolCallId="decision-1"
          isLastMessage
          msg={decisionMsg}
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

  // A card that IS the answer must not hide behind the collapsed step list.
  it("renders the object card outside the collapsed tool timeline", () => {
    render(
      <MemoryRouter>
        <CopilotMessageContent isLastMessage msg={showObjectsMsg} />
      </MemoryRouter>
    );

    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
    expect(screen.queryByText("Used 1 tool")).toBeNull();
  });

  // A connect button folded into the step list is one nobody can press.
  it("keeps a connect request out of the collapsed tool timeline", () => {
    render(
      <MemoryRouter>
        <CopilotMessageContent
          isLastMessage
          msg={{
            id: "assistant-1",
            role: "assistant",
            parts: [
              {
                type: "dynamic-tool",
                toolCallId: "c1",
                toolName: "engenty_tool_execute",
                resolvedToolName: "connections_request_connect",
                state: "output-available",
                input: { id: "connections_request_connect" },
                output: { ok: true },
              },
              { type: "text", text: "Connect your mailbox." },
            ],
          }}
        />
      </MemoryRouter>
    );

    expect(screen.queryByText("Used 1 tool")).toBeNull();
  });
});

describe("CopilotMessageContent file-read dump", () => {
  afterEach(() => {
    cleanup();
  });

  const DUMP =
    'cli-runs/run-001/time_tracking_plan.json (224634 bytes)\n 1->{\n 2->  "generated_at": "2026-08-08",\n 3->  "people": []';

  it("does not dump file content into the timeline, and names the read", () => {
    render(
      <MemoryRouter>
        <CopilotMessageContent
          isLastMessage
          msg={{
            id: "assistant-1",
            role: "assistant",
            parts: [
              {
                type: "dynamic-tool",
                toolCallId: "r1",
                toolName: "tool",
                state: "output-available",
                input: { path: "cli-runs/run-001/time_tracking_plan.json" },
                output: DUMP,
              },
            ],
          }}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText("Used 1 tool"));

    // File contents never show in the chat, even expanded; the step is
    // named after the file it read.
    expect(screen.queryByText(/generated_at/)).toBeNull();
    expect(screen.queryByText(/1->/)).toBeNull();
    expect(
      screen.getAllByText(/time_tracking_plan\.json/).length
    ).toBeGreaterThan(0);
  });
});

describe("CopilotMessageContent for a person", () => {
  afterEach(() => {
    cleanup();
  });

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

  // A person sees only what changed something they can see: a page opened,
  // a tour (folded to one line). Silent and failed calls show nothing.
  it("shows clips for what changed, folds a tour, and keeps the rest silent", () => {
    render(
      <MemoryRouter>
        <CopilotMessageContent
          isLastMessage
          msg={{
            id: "a1",
            parts: [
              tool(
                "s1",
                "skill",
                { name: "getting-started" },
                "# Getting started"
              ),
              tool(
                "d1",
                "ui_dom_snapshot",
                { root_selector: "main" },
                { elements: [] }
              ),
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
          }}
          toolDetail="person"
        />
      </MemoryRouter>
    );

    const clips = screen.getAllByTestId("tool-clip");
    expect(clips).toHaveLength(2);
    expect(clips[0]?.getAttribute("href")).toBe("/s/engrd/settings");
    expect(screen.queryByText(/Used \d tool/)).toBeNull();
  });
});
