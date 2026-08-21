import { describe, expect, it } from "vitest";
import {
  formatTranscriptToolRow,
  parseOperationId,
  readQuotedArg,
  resolveTranscriptToolDisplay,
} from "../resolve-transcript-tool-display.js";

const QUOTED_ARG_MAX_LEN = 48;

describe("parseOperationId", () => {
  it("parses two-part operation ids", () => {
    expect(parseOperationId("contacts_create")).toEqual({
      action: "create",
      scope: "contacts",
    });
  });

  it("parses multi-part operation ids", () => {
    expect(parseOperationId("contacts_search_index_status")).toEqual({
      action: "status",
      scope: "index",
    });
  });
});

describe("formatTranscriptToolRow", () => {
  it("shows metadata suffix only when quoted for search-style rows", () => {
    expect(
      formatTranscriptToolRow({
        verb: "Searched",
        quoted: "create",
        metadata: "projects",
        metadataMode: "when-quoted",
      })
    ).toEqual({
      displayLabel: 'Searched "create"',
      metadata: "projects",
    });
  });

  it("shows metadata always for execute-style rows", () => {
    expect(
      formatTranscriptToolRow({
        verb: "Created",
        metadata: "contacts",
        metadataMode: "always",
      })
    ).toEqual({
      displayLabel: "Created",
      metadata: "contacts",
    });
  });
});

describe("readQuotedArg", () => {
  it("reads common string keys from input", () => {
    expect(readQuotedArg({ name: "Acme" })).toBe("Acme");
    expect(readQuotedArg({ query: "law" })).toBe("law");
  });

  it("truncates long quoted values", () => {
    const long = "a".repeat(60);
    const quoted = readQuotedArg({ name: long });
    expect(quoted).toHaveLength(QUOTED_ARG_MAX_LEN);
  });

  it("reads added keys (label, slug, to, path)", () => {
    expect(readQuotedArg({ to: "/mdl/projects" })).toBe("/mdl/projects");
    expect(readQuotedArg({ label: "Phase" })).toBe("Phase");
  });

  it("digs one level into common wrappers (data/patch/values/…)", () => {
    expect(readQuotedArg({ data: { title: "Unterlagen" } })).toBe("Unterlagen");
    expect(readQuotedArg({ patch: { name: "Acme" } })).toBe("Acme");
    expect(readQuotedArg({ id: "p1", values: { title: "Docs" } })).toBe("Docs");
  });

  it("prefers a top-level quoted arg over a nested one", () => {
    expect(readQuotedArg({ title: "Top", data: { title: "Nested" } })).toBe(
      "Top"
    );
  });
});

describe("resolveTranscriptToolDisplay", () => {
  it("labels catalog execute create with name and scope", () => {
    expect(
      resolveTranscriptToolDisplay({
        toolName: "engenty_tool_execute",
        input: { id: "contacts_create", input: { name: "Acme" } },
      })
    ).toEqual({
      resolvedToolName: "contacts_create",
      displayLabel: 'Created "Acme"',
      metadata: "contacts",
    });
  });

  it("labels catalog execute create without payload input", () => {
    expect(
      resolveTranscriptToolDisplay({
        toolName: "engenty_tool_execute",
        input: { id: "contacts_create", input: {} },
      })
    ).toEqual({
      resolvedToolName: "contacts_create",
      displayLabel: "Created",
      metadata: "contacts",
    });
  });

  it("labels projects.create with scope metadata", () => {
    expect(
      resolveTranscriptToolDisplay({
        toolName: "engenty_tool_execute",
        input: { id: "projects_create" },
      })
    ).toEqual({
      resolvedToolName: "projects_create",
      displayLabel: "Created",
      metadata: "projects",
    });
  });

  it("labels an update op with its nested title", () => {
    expect(
      resolveTranscriptToolDisplay({
        toolName: "engenty_tool_execute",
        input: {
          id: "phases_update",
          input: { id: "p1", data: { title: "Unterlagen" } },
        },
      })
    ).toEqual({
      resolvedToolName: "phases_update",
      displayLabel: 'Updated "Unterlagen"',
      metadata: "phases",
    });
  });

  it("surfaces the primary arg for a non-structured frontend tool", () => {
    expect(
      resolveTranscriptToolDisplay({
        toolName: "invoke_frontend_tool",
        input: { name: "navigate", input: { to: "/mdl/projects" } },
      })
    ).toEqual({
      resolvedToolName: "navigate",
      displayLabel: 'Navigate: "/mdl/projects"',
    });
  });

  it("labels catalog search with query and scope", () => {
    expect(
      resolveTranscriptToolDisplay({
        toolName: "engenty_tool_execute",
        input: { id: "contacts_search", input: { query: "law" } },
      })
    ).toEqual({
      resolvedToolName: "contacts_search",
      displayLabel: 'Searched "law"',
      metadata: "contacts",
    });
  });

  it("keeps engenty_tools_search split labels", () => {
    expect(
      resolveTranscriptToolDisplay({
        toolName: "engenty_tools_search",
        input: { query: "create", moduleId: "projects" },
      })
    ).toEqual({
      resolvedToolName: "engenty_tools_search",
      displayLabel: 'Searched "create"',
      metadata: "projects",
    });
  });

  it("falls back when execute id is missing", () => {
    const result = resolveTranscriptToolDisplay({
      toolName: "engenty_tool_execute",
      input: {},
    });
    expect(result.resolvedToolName).toBe("engenty_tool_execute");
    expect(result.displayLabel).toContain("engenty_tool_execute");
  });

  it("humanizes dotted frontend tools with scope metadata", () => {
    expect(
      resolveTranscriptToolDisplay({
        toolName: "invoke_frontend_tool",
        input: { name: "shell_set_theme" },
      })
    ).toEqual({
      resolvedToolName: "shell_set_theme",
      displayLabel: "Set Theme",
      metadata: "shell",
    });
  });

  it("leads a requestDecision row with the QUESTION and trails the answer", () => {
    expect(
      resolveTranscriptToolDisplay({
        toolName: "requestDecision",
        output: {
          artifact_id: "a1",
          artifact_type: "decision",
          choice_id: "yes",
          choice_label: "Yes, proceed",
          choices: [{ id: "yes", label: "Yes, proceed" }],
          title: "Confirm",
        },
      })
    ).toEqual({
      resolvedToolName: "requestDecision",
      displayLabel: "Confirm",
      metadata: "Yes, proceed",
    });
  });

  it("recovers question AND answer once the resume sentence replaced the output", () => {
    // The native suspend resumes with a model-facing sentence as the tool
    // result, so the artifact is gone from `output` on any later read.
    expect(
      resolveTranscriptToolDisplay({
        toolName: "requestDecision",
        input: {
          choices: [{ id: "yes", label: "Yes, proceed" }],
          title: "Delete the draft?",
        },
        output: "The user selected: Yes, proceed",
      })
    ).toEqual({
      resolvedToolName: "requestDecision",
      displayLabel: "Delete the draft?",
      metadata: "Yes, proceed",
    });
  });

  it("still falls back to Decision needed when nothing survived", () => {
    expect(
      resolveTranscriptToolDisplay({
        toolName: "requestDecision",
        input: { id: "team_list", input: {} },
        output: { resolved: true },
      })
    ).toEqual({
      resolvedToolName: "requestDecision",
      displayLabel: "Decision needed",
    });
  });

  it("names an answered tool approval by verdict and operation", () => {
    // The gate rides the decision pipeline, so its rows arrive as
    // `requestDecision` — but the user approved an operation, they did not
    // answer a question. This used to read "Decision needed".
    expect(
      resolveTranscriptToolDisplay({
        toolName: "requestDecision",
        output: { approved: true, operation_id: "tasks_list" },
      })
    ).toEqual({
      resolvedToolName: "requestDecision",
      displayLabel: 'Approved "tasks_list"',
    });
    expect(
      resolveTranscriptToolDisplay({
        toolName: "requestDecision",
        output: { approved: false, operation_id: "tasks_list" },
      })
    ).toEqual({
      resolvedToolName: "requestDecision",
      displayLabel: 'Denied "tasks_list"',
    });
  });

  it("counts the rest of a bulk pre-approval in the row metadata", () => {
    expect(
      resolveTranscriptToolDisplay({
        toolName: "requestDecision",
        output: {
          approved: true,
          operation_id: "time_tracking_entries_create",
          operation_ids: [
            "time_tracking_entries_create",
            "time_tracking_entries_update",
            "time_tracking_entries_delete",
          ],
        },
      })
    ).toEqual({
      resolvedToolName: "requestDecision",
      displayLabel: 'Approved "time_tracking_entries_create"',
      metadata: "+2 more",
    });
  });

  it("leads an open approval row with the gate's own question", () => {
    expect(
      resolveTranscriptToolDisplay({
        toolName: "requestDecision",
        output: {
          artifact_id: "tool-approval|tasks_list",
          artifact_type: "decision",
          choices: [{ id: "approve_once", label: "Approve once" }],
          title: "Approve tasks_list?",
        },
      })
    ).toEqual({
      resolvedToolName: "requestDecision",
      displayLabel: "Approve tasks_list?",
    });
  });

  it("aligns discover rows when module and request are present", () => {
    expect(
      resolveTranscriptToolDisplay({
        toolName: "engenty_tools_discover",
        input: { request: "create contact", moduleId: "contacts" },
      })
    ).toEqual({
      resolvedToolName: "engenty_tools_discover",
      displayLabel: 'Discovered "create contact"',
      metadata: "contacts",
    });
  });

  it("labels workspace read_file with basename and line range", () => {
    expect(
      resolveTranscriptToolDisplay({
        toolName: "mastra_workspace_read_file",
        input: {
          path: "/sandbox/README.md",
          startLine: 1,
          endLine: 176,
        },
      })
    ).toEqual({
      resolvedToolName: "mastra_workspace_read_file",
      displayLabel: "Read README.md",
      metadata: "L1-176",
    });
  });

  it("labels workspace execute_command with command preview", () => {
    expect(
      resolveTranscriptToolDisplay({
        toolName: "mastra_workspace_execute_command",
        input: { command: "tree -L 1 /sandbox" },
      })
    ).toEqual({
      resolvedToolName: "mastra_workspace_execute_command",
      displayLabel: "Ran shell command",
      metadata: "tree -L 1 /sandbox",
    });
  });

  it("labels agent-engenty_cli as CLI Agent", () => {
    expect(
      resolveTranscriptToolDisplay({
        toolName: "agent-engenty_cli",
      })
    ).toEqual({
      resolvedToolName: "agent-engenty_cli",
      displayLabel: "CLI Agent",
    });
  });

  it("labels agent-engenty_tools as Engenty Tools", () => {
    expect(
      resolveTranscriptToolDisplay({
        toolName: "agent-engenty_tools",
      })
    ).toEqual({
      resolvedToolName: "agent-engenty_tools",
      displayLabel: "Engenty Tools",
    });
  });

  it("humanizes unknown agent ids", () => {
    const result = resolveTranscriptToolDisplay({
      toolName: "agent-some_custom_agent",
    });
    expect(result.resolvedToolName).toBe("agent-some_custom_agent");
    expect(result.displayLabel).toBe("Some Custom Agent");
  });

  it("labels direct structured tool execution with scopes", () => {
    expect(
      resolveTranscriptToolDisplay({
        toolName: "knowledge_base_article_search",
        input: { q: "ich brauche den iban von engrd" },
      })
    ).toEqual({
      resolvedToolName: "knowledge_base_article_search",
      displayLabel: 'Searched "ich brauche den iban von engrd"',
      metadata: "article",
    });
  });

  it("shows the full operation id for unknown compound tool names (imported connectors)", () => {
    expect(
      resolveTranscriptToolDisplay({
        toolName: "mcp_deepwiki_com_read_wiki_structure",
        input: { repoName: "vercel/next.js" },
      })
    ).toEqual({
      resolvedToolName: "mcp_deepwiki_com_read_wiki_structure",
      displayLabel: "Structure",
      metadata: "mcp_deepwiki_com_read_wiki_structure",
    });
  });

  it("labels custom unstructured tools with common arguments", () => {
    expect(
      resolveTranscriptToolDisplay({
        toolName: "customtool",
        input: { query: "hello world" },
      })
    ).toEqual({
      resolvedToolName: "customtool",
      displayLabel: 'Customtool: "hello world"',
    });
  });
});
