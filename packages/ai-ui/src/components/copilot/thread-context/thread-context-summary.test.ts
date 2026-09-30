import { describe, expect, it } from "vitest";
import { buildChatAttachmentPart } from "../../../lib/chat-attachment-part.js";
import { buildChatReferencePart } from "../../../lib/chat-reference-part.js";
import {
  buildThreadContextSummary,
  type ThreadContextHrefMatcher,
} from "./thread-context-summary.js";
import type { ThreadContextMessageLike } from "./thread-context-types.js";

function summarize(
  messages: ThreadContextMessageLike[],
  options: {
    matchers?: ThreadContextHrefMatcher[];
    spaceKey?: string;
    threadId?: string;
  } = {}
) {
  return buildThreadContextSummary({ artefacts: [], messages, ...options });
}

function messageAgentPart(
  toolCallId: string,
  agentId: string,
  output: Record<string, unknown> = { ok: true }
) {
  return {
    type: "tool-message_agent",
    toolCallId,
    toolName: "message_agent",
    state: "output-available",
    input: { agent_id: agentId, message: "go" },
    output,
  };
}

describe("thread context summary: sources", () => {
  it("lists KB links and web search results once each", () => {
    const kb = "/kb/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/policy#L1-L2";
    const summary = summarize([
      {
        role: "assistant",
        parts: [
          {
            type: "text",
            text: `See [Policy](${kb}) and [Policy again](${kb}).`,
          },
          {
            type: "tool-web_search",
            toolName: "web_search",
            state: "output-available",
            output: {
              results: [
                { title: "Example", url: "https://example.com/a" },
                { title: "Example 2", url: "https://example.com/b" },
                { title: "Dup", url: "https://example.com/a" },
              ],
            },
          },
        ],
      },
    ]);
    expect(summary.isEmpty).toBe(false);
    expect(summary.sources.map((s) => s.url)).toEqual([
      kb,
      "https://example.com/a",
      "https://example.com/b",
    ]);
  });

  it("links /data module-record paths into the Space data page", () => {
    const summary = summarize(
      [
        {
          role: "assistant",
          parts: [
            {
              type: "text",
              text: "Read records at /data/Research/acme.md and /data/Research/sources.md.",
            },
          ],
        },
      ],
      { spaceKey: "company" }
    );
    expect(summary.sources.map((s) => s.url)).toEqual([
      "/s/company/data?path=Research%2Facme.md",
      "/s/company/data?path=Research%2Fsources.md",
    ]);
  });

  it("keeps stale non-module /data links openable under Files", () => {
    const summary = summarize(
      [
        {
          role: "assistant",
          parts: [
            {
              type: "text",
              text: "An older run referenced /data/sfg-angebot/ and /data/sfg-kontakt-ergebnis.json.",
            },
          ],
        },
      ],
      { spaceKey: "tpl-client" }
    );
    expect(summary.sources.map((s) => s.url)).toEqual([
      "/s/tpl-client/data?path=Files%2Fsfg-angebot%2F",
      "/s/tpl-client/data?path=Files%2Fsfg-kontakt-ergebnis.json",
    ]);
  });
});

describe("thread context summary: attachments", () => {
  it("lists each user attachment once and skips @-mention carriers", () => {
    const imagePart = buildChatAttachmentPart({
      meta: {
        filename: "image.png",
        mimeType: "image/png",
        size: 12,
        storageKey: "ten/chat/image.png",
      },
      url: "https://signed.test/image.png",
    });
    const pdfPart = buildChatAttachmentPart({
      meta: {
        filename: "notes.pdf",
        mimeType: "application/pdf",
        size: 40,
        storageKey: "ten/chat/notes.pdf",
      },
      url: "https://signed.test/notes.pdf",
    });
    const summary = summarize([
      {
        role: "user",
        parts: [
          { type: "text", text: "see this" },
          imagePart,
          imagePart,
          pdfPart,
          buildChatReferencePart([
            {
              entity: "contacts:contact",
              label: "Ada",
              ref: "contacts:contact:1",
            },
          ]),
        ],
      },
    ]);

    expect(summary.isEmpty).toBe(false);
    expect(summary.attachments).toEqual([
      {
        filename: "image.png",
        mimeType: "image/png",
        storageKey: "ten/chat/image.png",
        url: "https://signed.test/image.png",
      },
      {
        filename: "notes.pdf",
        mimeType: "application/pdf",
        storageKey: "ten/chat/notes.pdf",
        url: "https://signed.test/notes.pdf",
      },
    ]);
  });
});

describe("thread context summary: objects", () => {
  it("lists show_objects refs once each", () => {
    const summary = summarize([
      {
        role: "assistant",
        parts: [
          {
            type: "tool-show_objects",
            toolName: "show_objects",
            state: "output-available",
            output: {
              _meta: {
                engenty: {
                  object_render: {
                    display: "inline",
                    refs: ["contacts:contact:c1", "contacts:contact:c1"],
                    items: [{ ref: "contacts:contact:c1", title: "ACME" }],
                  },
                },
              },
            },
          },
        ],
      },
    ]);
    expect(summary.objects).toEqual([
      {
        href: null,
        ref: { module: "contacts", entity: "contact", id: "c1" },
        title: "ACME",
      },
    ]);
  });

  it("turns /mdl prose links into objects via a widget matcher", () => {
    const summary = summarize(
      [
        {
          role: "assistant",
          parts: [
            { type: "text", text: "Look at [ACME](/mdl/contacts/c1) please." },
          ],
        },
      ],
      {
        matchers: [
          {
            matchHref: (pathname) => {
              const m = pathname.match(/^\/mdl\/contacts\/([^/]+)$/);
              return m?.[1]
                ? { module: "contacts", entity: "contact", id: m[1] }
                : null;
            },
          },
        ],
      }
    );
    expect(summary.objects).toEqual([
      {
        href: "/mdl/contacts/c1",
        ref: { module: "contacts", entity: "contact", id: "c1" },
        title: "ACME",
      },
    ]);
  });
});

describe("thread context summary: agents", () => {
  it("links agent-* delegations to the sub-run and skips ordinary tools", () => {
    const summary = summarize(
      [
        {
          role: "assistant",
          parts: [
            {
              type: "dynamic-tool",
              toolCallId: "fa-1",
              toolName: "agent-file_analyst",
              state: "output-available",
            },
            {
              type: "dynamic-tool",
              toolCallId: "ws-1",
              toolName: "web_search",
              state: "output-available",
              output: { results: [] },
            },
          ],
        },
      ],
      { threadId: "thread-1" }
    );
    expect(summary.isEmpty).toBe(false);
    expect(
      summary.agents.map(({ agentId, href }) => ({ agentId, href }))
    ).toEqual([{ agentId: "file_analyst", href: "/copilot?subRun=fa-1" }]);
  });

  it("reads the colleague of a message_agent turn from agent_id", () => {
    const summary = summarize(
      [
        {
          role: "assistant",
          parts: [messageAgentPart("msg-1", "sales.researcher")],
        },
      ],
      { threadId: "thread-1" }
    );
    expect(
      summary.agents.map(({ agentId, href }) => ({ agentId, href }))
    ).toEqual([{ agentId: "sales.researcher", href: "/copilot?subRun=msg-1" }]);
  });

  it("links Space specialists to their desk, opening the child thread", () => {
    const summary = summarize(
      [
        {
          role: "assistant",
          parts: [
            messageAgentPart("msg-1", "contacts.manager", {
              child_thread_id: "221230c5-01c1-4b59-a3d1-1ee418a33b61",
              ok: true,
            }),
            messageAgentPart("msg-2", "offers.manager"),
          ],
        },
      ],
      { spaceKey: "tpl-client", threadId: "parent-thread" }
    );
    expect(summary.agents.map((a) => a.href)).toEqual([
      "/s/tpl-client/agents/contacts.manager?engagement=conversation%3A221230c5-01c1-4b59-a3d1-1ee418a33b61",
      "/s/tpl-client/agents/offers.manager",
    ]);
  });

  it("links the Space Copilot to its one chat, other agents to their desk", () => {
    const summary = summarize(
      [
        {
          role: "assistant",
          parts: [
            messageAgentPart("copilot-1", "engenty.copilot", {
              child_thread_id: "221230c5-01c1-4b59-a3d1-1ee418a33b61",
              ok: true,
            }),
            messageAgentPart("coordinator-1", "engenty.coordinator"),
          ],
        },
      ],
      { spaceKey: "Sales / DACH", threadId: "parent-thread" }
    );
    expect(summary.agents.map((a) => a.href)).toEqual([
      "/s/Sales%20%2F%20DACH/copilot",
      "/s/Sales%20%2F%20DACH/agents/engenty.coordinator",
    ]);
  });

  it("keeps only the latest run per agent", () => {
    const run = (toolCallId: string) => ({
      type: "dynamic-tool",
      toolCallId,
      toolName: "agent-engenty_cli",
      state: "output-available",
    });
    const summary = summarize(
      [{ role: "assistant", parts: [run("cli-1"), run("cli-2")] }],
      { threadId: "thread-1" }
    );
    expect(summary.agents.map((a) => a.toolCallId)).toEqual(["cli-2"]);
  });
});

describe("thread context summary: isEmpty", () => {
  it("is empty when the thread has nothing", () => {
    expect(summarize([]).isEmpty).toBe(true);
  });

  it("is not empty when artefacts exist", () => {
    const summary = buildThreadContextSummary({
      artefacts: [{ id: "a1", title: "Doc", type: "markdown" }],
      messages: [],
    });
    expect(summary.isEmpty).toBe(false);
  });
});
