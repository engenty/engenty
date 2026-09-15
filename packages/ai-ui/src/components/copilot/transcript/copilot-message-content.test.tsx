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

    // Collapsed while live: the header IS the status line and names the
    // running step — one truncated line, not a bare "Working…".
    const header = screen.getByText('Searching for "engenty docs"');
    expect(header.closest("[data-slot=cot-header]")).toBeTruthy();
    expect(screen.queryByText("Working…")).toBeNull();
    // Reasoning is not rendered anywhere (no accordion, no chain step).
    expect(screen.queryByText("Decide the query.")).toBeNull();
    expect(screen.queryByText("Thinking")).toBeNull();
    // The steps are one click away.
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getAllByText('Searching for "engenty docs"').length).toBe(2);
  });

  it("stays live between two tool calls and says it is thinking", () => {
    // The gap after a finished tool, before the next call or the answer, used
    // to collapse the timeline to "Worked for Ns" — the turn read as finished
    // while the model was still working.
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
                toolCallId: "ws-1",
                toolName: "web_search",
                state: "output-available",
                input: { query: "engenty docs" },
                output: { results: [] },
              },
            ],
          }}
          status="streaming"
        />
      </MemoryRouter>
    );
    const header = screen.getByText("Thinking…");
    expect(header.closest("[data-slot=cot-header]")).toBeTruthy();
    expect(screen.queryByText(/Worked for/)).toBeNull();
  });

  it("closes the live line once answer text follows the tools", () => {
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
                toolCallId: "ws-1",
                toolName: "web_search",
                state: "output-available",
                input: { query: "engenty docs" },
                output: { results: [] },
              },
              { type: "text", text: "Here is what I found." },
            ],
          }}
          status="streaming"
        />
      </MemoryRouter>
    );
    expect(screen.queryByText("Thinking…")).toBeNull();
    expect(screen.getByText("Used 1 tool")).toBeTruthy();
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

    // The running step's label is the collapsed header's status line…
    expect(screen.getByText('Updated "Unterlagen"')).toBeTruthy();
    // …and its details sit in the step, one click away.
    fireEvent.click(screen.getByRole("button", { expanded: false }));
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

    // Completed runs collapse the timeline; expand it to reveal the step list
    // (details are always visible — no per-step Show details toggle).
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

describe("CopilotMessageContent tool list across text", () => {
  afterEach(() => {
    cleanup();
  });

  it("keeps every regular tool in one expandable ChainOfThought list", () => {
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
                // Stringified AG-UI result — must not dump as a timeline snippet.
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
          status="ready"
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText("Used 2 tools"));
    expect(screen.getByText('Searched "iban"')).toBeTruthy();
    expect(screen.getByText('Searched "engrd"')).toBeTruthy();
    expect(screen.getByText("0 results")).toBeTruthy();
    expect(screen.getByText("1 result")).toBeTruthy();
    expect(screen.queryByText(/"ok":true/)).toBeNull();
    expect(screen.queryByText(/body_html/)).toBeNull();
  });

  it("shows brief list counts and update fields under tool steps", () => {
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
                toolCallId: "list-1",
                toolName: "inbox_list_accounts",
                state: "output-available",
                displayLabel: "Listed",
                metadata: "accounts",
                input: {},
                output: {
                  ok: true,
                  data: { total: 2, results: [{ id: "a" }, { id: "b" }] },
                },
              },
              {
                type: "dynamic-tool",
                toolCallId: "upd-1",
                toolName: "inbox_update_settings",
                state: "output-available",
                displayLabel: "Updated",
                metadata: "settings",
                input: {
                  account_id: "6d83c905-d554-4952-8fdf-22f46709aaaa",
                  backfill_days: 60,
                },
                output: { ok: true, data: { backfill_days: 60 } },
              },
              { type: "text", text: "Done." },
            ],
          }}
          status="ready"
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText("Used 2 tools"));
    expect(screen.getByText("2 accounts")).toBeTruthy();
    expect(screen.getByText("backfill_days: 60")).toBeTruthy();
    expect(
      screen.queryByText(/6d83c905-d554-4952-8fdf-22f46709aaaa/)
    ).toBeNull();
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
          messages={[{ id: "assistant-1" }]}
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
          status="ready"
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText("Used 1 tool"));

    // The protocol body must not be visible in the timeline, even expanded.
    expect(screen.queryByText(/generated_at/)).toBeNull();
    expect(screen.queryByText(/1->/)).toBeNull();
    // …and the placeholder label is recovered from the dump header.
    expect(
      screen.getAllByText(/time_tracking_plan\.json/).length
    ).toBeGreaterThan(0);
    expect(screen.queryByText("Ran tool")).toBeNull();
  });
});
