import { describe, expect, it } from "vitest";
import { buildChatAttachmentPart } from "../../../lib/chat-attachment-part.js";
import { buildChatReferencePart } from "../../../lib/chat-reference-part.js";
import {
  buildThreadContextSummary,
  extractThreadAgents,
  extractThreadAttachments,
  extractThreadObjects,
  extractThreadSources,
} from "./thread-context-summary.js";

describe("extractThreadSources", () => {
  it("dedupes KB markdown links by URL", () => {
    const messages = [
      {
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "See [Policy](/kb/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/policy#L1-L2) and [Policy again](/kb/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/policy#L1-L2).",
          },
        ],
      },
    ];
    const sources = extractThreadSources(messages);
    expect(sources).toHaveLength(1);
    expect(sources[0]?.title).toBe("Policy");
    expect(sources[0]?.url).toContain("/kb/");
  });

  it("collects web_search result URLs", () => {
    const messages = [
      {
        role: "assistant",
        parts: [
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
    ];
    const sources = extractThreadSources(messages);
    expect(sources.map((s) => s.url)).toEqual([
      "https://example.com/a",
      "https://example.com/b",
    ]);
  });

  it("collects /data module-record paths as Space Data links", () => {
    const messages = [
      {
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "Read records at /data/Research/acme.md and /data/Research/sources.md.",
          },
        ],
      },
    ];
    const sources = extractThreadSources(messages, "company");
    expect(sources.map((s) => s.url)).toEqual([
      "/s/company/data?path=Research%2Facme.md",
      "/s/company/data?path=Research%2Fsources.md",
    ]);
  });

  it("keeps stale non-module transcript links openable via the 404 guard", () => {
    const messages = [
      {
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "An older run referenced /data/sfg-angebot/ and /data/sfg-kontakt-ergebnis.json.",
          },
        ],
      },
    ];
    const sources = extractThreadSources(messages, "tpl-client");
    expect(sources.map((s) => s.url)).toEqual([
      "/s/tpl-client/data?path=Files%2Fsfg-angebot%2F",
      "/s/tpl-client/data?path=Files%2Fsfg-kontakt-ergebnis.json",
    ]);
  });
});

describe("extractThreadAttachments", () => {
  it("collects user image/document parts and skips @-mention carriers", () => {
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
    const messages = [
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
    ];

    expect(extractThreadAttachments(messages)).toEqual([
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

describe("extractThreadObjects", () => {
  it("reads show_objects meta and dedupes by ref", () => {
    const messages = [
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
                    items: [
                      {
                        ref: "contacts:contact:c1",
                        title: "ACME",
                      },
                    ],
                  },
                },
              },
            },
          },
        ],
      },
    ];
    const objects = extractThreadObjects(messages, []);
    expect(objects).toHaveLength(1);
    expect(objects[0]?.title).toBe("ACME");
    expect(objects[0]?.ref).toEqual({
      module: "contacts",
      entity: "contact",
      id: "c1",
    });
  });

  it("upgrades /mdl prose mentions via matchHref", () => {
    const messages = [
      {
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "Look at [ACME](/mdl/contacts/c1) please.",
          },
        ],
      },
    ];
    const objects = extractThreadObjects(messages, [
      {
        matchHref: (pathname) => {
          const m = pathname.match(/^\/mdl\/contacts\/([^/]+)$/);
          if (!m?.[1]) {
            return null;
          }
          return { module: "contacts", entity: "contact", id: m[1] };
        },
        getHref: (ref) => `/mdl/contacts/${ref.id}`,
      },
    ]);
    expect(objects).toHaveLength(1);
    expect(objects[0]?.title).toBe("ACME");
    expect(objects[0]?.href).toBe("/mdl/contacts/c1");
  });
});

describe("extractThreadAgents", () => {
  it("collects agent-* delegations and skips ordinary tools", () => {
    const messages = [
      {
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolCallId: "fa-1",
            toolName: "agent-file_analyst",
            state: "output-available",
            input: { task: "Summarize the PDF" },
            output: { summary: "Done." },
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
    ];
    const agents = extractThreadAgents(messages, "thread-1");
    expect(agents).toEqual([
      {
        agentId: "file_analyst",
        agentName: "File Analyst",
        href: "/mdl/engenty-copilot/chat/thread-1?subRun=fa-1",
        toolCallId: "fa-1",
      },
    ]);
  });

  it("collects message_agent turns from agent_id input", () => {
    const messages = [
      {
        role: "assistant",
        parts: [
          {
            type: "tool-message_agent",
            toolCallId: "msg-1",
            toolName: "message_agent",
            state: "output-available",
            input: { agent_id: "sales.researcher", message: "research Acme" },
            output: { ok: true, result: "done" },
          },
        ],
      },
    ];
    const agents = extractThreadAgents(messages, "thread-1");
    expect(agents[0]?.agentId).toBe("sales.researcher");
    expect(agents[0]?.toolCallId).toBe("msg-1");
    expect(agents[0]?.href).toBe(
      "/mdl/engenty-copilot/chat/thread-1?subRun=msg-1"
    );
  });

  it("links Space specialists to their desk, opening the child thread", () => {
    const messages = [
      {
        role: "assistant",
        parts: [
          {
            type: "tool-message_agent",
            toolCallId: "msg-1",
            toolName: "message_agent",
            state: "output-available",
            input: {
              agent_id: "contacts.manager",
              message: "Create SFG",
            },
            output: {
              agent: "contacts.manager",
              child_thread_id: "221230c5-01c1-4b59-a3d1-1ee418a33b61",
              ok: true,
              result: "done",
            },
          },
          {
            type: "tool-message_agent",
            toolCallId: "msg-2",
            toolName: "message_agent",
            state: "output-available",
            input: { agent_id: "offers.manager", message: "Draft the offer" },
            output: { ok: true, result: "parked" },
          },
        ],
      },
    ];
    const agents = extractThreadAgents(messages, "parent-thread", "tpl-client");
    expect(agents).toEqual([
      {
        agentId: "contacts.manager",
        agentName: "Contacts.Manager",
        href: "/s/tpl-client/agents/contacts.manager?engagement=conversation%3A221230c5-01c1-4b59-a3d1-1ee418a33b61",
        toolCallId: "msg-1",
      },
      {
        agentId: "offers.manager",
        agentName: "Offers.Manager",
        href: "/s/tpl-client/agents/offers.manager",
        toolCallId: "msg-2",
      },
    ]);
  });

  it("links Space Copilot to canonical chat while other agents stay on their desk", () => {
    const messages = [
      {
        role: "assistant",
        parts: [
          {
            type: "tool-message_agent",
            toolCallId: "copilot-1",
            toolName: "message_agent",
            state: "output-available",
            input: { agent_id: "engenty.copilot", message: "Continue" },
            output: {
              child_thread_id: "221230c5-01c1-4b59-a3d1-1ee418a33b61",
              ok: true,
            },
          },
          {
            type: "tool-message_agent",
            toolCallId: "coordinator-1",
            toolName: "message_agent",
            state: "output-available",
            input: { agent_id: "engenty.coordinator", message: "Plan" },
            output: { ok: true },
          },
        ],
      },
    ];

    expect(
      extractThreadAgents(messages, "parent-thread", "Sales / DACH").map(
        ({ agentId, href }) => ({ agentId, href })
      )
    ).toEqual([
      {
        agentId: "engenty.copilot",
        href: "/s/Sales%20%2F%20DACH/copilot/chat/221230c5-01c1-4b59-a3d1-1ee418a33b61",
      },
      {
        agentId: "engenty.coordinator",
        href: "/s/Sales%20%2F%20DACH/agents/engenty.coordinator",
      },
    ]);
  });

  it("keeps the latest run per agent id", () => {
    const messages = [
      {
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolCallId: "cli-1",
            toolName: "agent-engenty_cli",
            state: "output-available",
          },
          {
            type: "dynamic-tool",
            toolCallId: "cli-2",
            toolName: "agent-engenty_cli",
            state: "output-available",
          },
        ],
      },
    ];
    const agents = extractThreadAgents(messages, "thread-1");
    expect(agents).toHaveLength(1);
    expect(agents[0]?.toolCallId).toBe("cli-2");
    expect(agents[0]?.agentName).toBe("CLI Agent");
  });
});

describe("buildThreadContextSummary", () => {
  it("isEmpty when nothing is present", () => {
    const summary = buildThreadContextSummary({
      artefacts: [],
      messages: [],
    });
    expect(summary.isEmpty).toBe(true);
  });

  it("is not empty when artefacts exist", () => {
    const summary = buildThreadContextSummary({
      artefacts: [{ id: "a1", title: "Doc", type: "markdown" }],
      messages: [],
    });
    expect(summary.isEmpty).toBe(false);
    expect(summary.artefacts).toHaveLength(1);
  });

  it("is not empty when attachments exist", () => {
    const summary = buildThreadContextSummary({
      artefacts: [],
      messages: [
        {
          role: "user",
          parts: [
            buildChatAttachmentPart({
              meta: {
                filename: "image.png",
                mimeType: "image/png",
                size: 12,
                storageKey: "ten/chat/image.png",
              },
              url: "https://signed.test/image.png",
            }),
          ],
        },
      ],
    });
    expect(summary.isEmpty).toBe(false);
    expect(summary.attachments).toHaveLength(1);
    expect(summary.attachments[0]?.filename).toBe("image.png");
  });

  it("is not empty when a sub-agent ran", () => {
    const summary = buildThreadContextSummary({
      artefacts: [],
      messages: [
        {
          role: "assistant",
          parts: [
            {
              type: "dynamic-tool",
              toolCallId: "fa-1",
              toolName: "agent-file_analyst",
              state: "output-available",
            },
          ],
        },
      ],
    });
    expect(summary.isEmpty).toBe(false);
    expect(summary.agents).toHaveLength(1);
    expect(summary.agents[0]?.agentId).toBe("file_analyst");
  });
});
