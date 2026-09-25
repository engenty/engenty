// Pulls in the Mastra workflow module graph on import — same generous pin the
// other apps/ai suites use.
import { describe, expect, it, vi } from "vitest";
import { GRAPH_RUN_CONTEXT } from "../run-context.js";
import {
  assertValidGraphAction,
  type GraphWorkflowDefinition,
  validateGraphAction,
} from "../validate-graph.js";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const objectSchema = { type: "object", properties: {} } as const;

function mapping(id: string, config: Record<string, unknown>) {
  return { type: "mapping", id, mapConfig: JSON.stringify(config) };
}

function toolEntry(id: string, toolId: string) {
  return { type: "tool", id, toolId };
}

function def(graph: unknown[]): GraphWorkflowDefinition {
  return {
    id: "test-graph",
    graph,
    inputSchema: objectSchema as never,
    outputSchema: objectSchema as never,
  };
}

/** Issue codes only — the prose is UI copy, the codes are the contract. */
function codes(graph: unknown[], options = {}) {
  return validateGraphAction(def(graph), options).map((issue) => issue.code);
}

describe("validateGraphAction — tool references", () => {
  it("accepts a constant-fed engenty_tool node", () => {
    const graph = [
      mapping("prep", {
        tool_id: { value: "invoices_update" },
        input: { step: "initData", path: "." },
      }),
      toolEntry("write", "engenty_tool"),
    ];
    expect(codes(graph)).not.toContain("dynamic-tool-id");
    expect(codes(graph)).not.toContain("unknown-tool");
  });

  it("rejects a tool that is not a graph primitive", () => {
    const graph = [
      mapping("prep", { tool_id: { value: "x" } }),
      toolEntry("write", "invoices_update"),
    ];
    expect(codes(graph)).toContain("unknown-tool");
  });

  it("rejects a computed tool_id — it cannot be capability-checked", () => {
    const graph = [
      // tool_id flows in from an upstream step instead of being a constant
      mapping("prep", { tool_id: { step: "pick", path: "operation" } }),
      toolEntry("write", "engenty_tool"),
    ];
    expect(codes(graph)).toContain("dynamic-tool-id");
  });

  it("rejects an engenty_tool with no mapping before it at all", () => {
    expect(codes([toolEntry("write", "engenty_tool")])).toContain(
      "dynamic-tool-id"
    );
  });
});

describe("validateGraphAction — capability gate", () => {
  const graph = [
    mapping("prep", { tool_id: { value: "invoices_update" } }),
    toolEntry("write", "engenty_tool"),
  ];
  const capabilityForOperation = (op: string) =>
    op === "invoices_update" ? "module.invoices.write" : undefined;

  /** Stand-in for `scopeCoversCapability` — pattern coverage, not membership. */
  const holds = (held: string[]) => (needed: string) =>
    held.some(
      (pattern) =>
        pattern === needed ||
        pattern === "*" ||
        (pattern.endsWith(".*") && needed.startsWith(pattern.slice(0, -1)))
    );

  it("flags an operation the author cannot invoke themselves", () => {
    const issues = validateGraphAction(def(graph), {
      capabilityForOperation,
      holdsCapability: holds(["module.invoices.read"]),
    });
    const missing = issues.find((issue) => issue.code === "capability-missing");
    expect(missing?.message).toMatch(/module\.invoices\.write/);
    expect(missing?.entryId).toBe("write");
  });

  it("passes when the author holds the capability", () => {
    expect(
      codes(graph, {
        capabilityForOperation,
        holdsCapability: holds(["module.invoices.write"]),
      })
    ).not.toContain("capability-missing");
  });

  it("honours pattern capabilities the way core does", () => {
    // A holder of `module.invoices.*` legitimately covers `.write` — the check
    // must use engenty's pattern semantics, not list membership, or every
    // role-based grant would read as missing.
    expect(
      codes(graph, {
        capabilityForOperation,
        holdsCapability: holds(["module.invoices.*"]),
      })
    ).not.toContain("capability-missing");
  });

  it("skips the pass entirely when no capability source is supplied", () => {
    // Read-only preflight on a graph nobody is saving: report structure
    // problems without inventing authorization failures.
    expect(codes(graph)).not.toContain("capability-missing");
  });
});

describe("validateGraphAction — run_specialist", () => {
  it("accepts a constant agent key with a declared output schema", () => {
    const graph = [
      mapping("prep", {
        agent_type_key: { value: "invoices.manager" },
        brief: { value: "draft the invoice" },
        output_schema: { value: objectSchema },
      }),
      toolEntry("draft", "run_specialist"),
    ];
    expect(codes(graph)).not.toContain("dynamic-agent-key");
    expect(codes(graph)).not.toContain("missing-output-schema");
  });

  it("rejects a computed agent key", () => {
    const graph = [
      mapping("prep", {
        agent_type_key: { step: "pick", path: "agent" },
        output_schema: { value: objectSchema },
      }),
      toolEntry("draft", "run_specialist"),
    ];
    expect(codes(graph)).toContain("dynamic-agent-key");
  });

  it("requires an output schema so downstream nodes can be type-checked", () => {
    const graph = [
      mapping("prep", { agent_type_key: { value: "invoices.manager" } }),
      toolEntry("draft", "run_specialist"),
      mapping("prep-send", { tool_id: { value: "invoices_send" } }),
      toolEntry("send", "engenty_tool"),
    ];
    expect(codes(graph)).toContain("missing-output-schema");
  });

  it("lets the LAST step answer in prose — nothing downstream to type-check", () => {
    // An Action compiled to a one-node flow ends here, and its result is the
    // markdown the button shows. `output_schema` would put the agent under a
    // JSON-only contract, so demanding one would make that flow unwritable.
    const graph = [
      mapping("prep", {
        agent_type_key: { value: "invoices.manager" },
        brief: { value: "summarize this invoice" },
      }),
      toolEntry("summarize", "run_specialist"),
    ];
    expect(codes(graph)).not.toContain("missing-output-schema");
  });

  it("still requires one inside a branch, wherever the branch sits", () => {
    // "Nothing follows me" is only knowable on the top-level spine; inside a
    // container it depends on the container, so the rule stays fail-closed.
    const graph = [
      {
        id: "route",
        type: "conditional",
        predicates: [{ path: "initData.kind", equals: "invoice" }],
        steps: [
          mapping("prep", { agent_type_key: { value: "invoices.manager" } }),
          toolEntry("draft", "run_specialist"),
        ],
      },
    ];
    expect(codes(graph)).toContain("missing-output-schema");
  });
});

describe("validateGraphAction — reading a specialist's answer", () => {
  const draft = [
    mapping("prep", {
      agent_type_key: { value: "sales.offer-desk" },
      brief: { value: "draft the offer" },
      output_schema: { value: objectSchema },
    }),
    toolEntry("draft", "run_specialist"),
  ];

  it("rejects a page bound to the whole step or a template skipping output", () => {
    // Live-observed: the approval page bound to {step:"draft",path:""} showed
    // every field empty, because the answer sits under `output`.
    expect(
      codes([
        ...draft,
        mapping("prep-review", { data: { step: "draft", path: "" } }),
        toolEntry("review", "approval_gate"),
      ])
    ).toContain("specialist-output-path");
    expect(
      codes([
        ...draft,
        mapping("prep-send", {
          // biome-ignore lint/suspicious/noTemplateCurlyInString: the workflow's own template syntax
          brief: { template: "Send ${stepResults.draft.title}" },
          agent_type_key: { value: "sales.offer-desk" },
        }),
        toolEntry("send", "run_specialist"),
      ])
    ).toContain("specialist-output-path");
  });

  it("accepts reads through output", () => {
    expect(
      codes([
        ...draft,
        mapping("prep-review", { data: { step: "draft", path: "output" } }),
        toolEntry("review", "approval_gate"),
        mapping("prep-send", {
          // biome-ignore lint/suspicious/noTemplateCurlyInString: the workflow's own template syntax
          brief: { template: "Send ${stepResults.draft.output.title}" },
          agent_type_key: { value: "sales.offer-desk" },
        }),
        toolEntry("send", "run_specialist"),
      ])
    ).not.toContain("specialist-output-path");
  });
});

describe("validateGraphAction — identity and containment", () => {
  it("rejects a graph that asserts its own tenant", () => {
    const graph = [
      mapping("prep", {
        [GRAPH_RUN_CONTEXT.tenantId]: { value: "some-other-tenant" },
        tool_id: { value: "invoices_update" },
      }),
      toolEntry("write", "engenty_tool"),
    ];
    expect(codes(graph)).toContain("tenant-identity-in-graph");
  });

  it("rejects an approval gate inside a foreach", () => {
    const graph = [
      {
        type: "foreach",
        id: "each-invoice",
        step: toolEntry("gate", "approval_gate"),
      },
    ];
    expect(codes(graph)).toContain("gate-in-foreach");
  });

  it("allows an approval gate outside a foreach", () => {
    const graph = [
      mapping("prep", { title: { value: "Send?" } }),
      toolEntry("gate", "approval_gate"),
    ];
    expect(codes(graph)).not.toContain("gate-in-foreach");
  });

  it("accepts a graph whose agent entries were translated at the boundary", () => {
    // Native `agent` entries are legal INPUT — translate-agent-entries.ts
    // rewrites them to mapping + run_specialist before validation, so the
    // validator only ever sees the translated form.
    const graph = [{ type: "agent", id: "ask", agentId: "invoices.manager" }];
    expect(codes(graph)).not.toContain("agent-entry-unsupported");
  });
});

describe("assertValidGraphAction", () => {
  it("throws with every issue listed", () => {
    const graph = [toolEntry("write", "invoices_update")];
    expect(() => assertValidGraphAction(def(graph))).toThrow(/unknown-tool/);
  });

  it("does not throw on a clean graph", () => {
    const graph = [
      mapping("prep", {
        tool_id: { value: "invoices_update" },
        input: { initData: true, path: "." },
      }),
      toolEntry("write", "engenty_tool"),
    ];
    expect(() => assertValidGraphAction(def(graph))).not.toThrow();
  });
});

describe("validateGraphAction — entry shape", () => {
  it("rejects a tool name used as the entry type", () => {
    // The mistake an LLM actually makes, observed live: it writes the toolId as
    // the entry type with an `args` object. That graph is meaningless to the
    // engine but slips past every `type === "tool"` check, saves, and renders
    // as a row of blank steps — so it has to fail here.
    const graph = [
      mapping("prep", { agent_type_key: { value: "writer" } }),
      { args: {}, id: "draft", type: "run_specialist" },
    ];
    expect(codes(graph)).toContain("unknown-entry-type");
  });

  it("names the fix in the message", () => {
    const issues = validateGraphAction(
      def([{ args: {}, id: "send", type: "engenty_tool" }])
    );
    const issue = issues.find((entry) => entry.code === "unknown-entry-type");
    expect(issue?.message).toContain('"type": "tool"');
    expect(issue?.message).toContain('"toolId": "engenty_tool"');
  });

  it("rejects a conditional written as an inline if", () => {
    // Observed live: the model emits `{ type: "conditional", predicate: … }`
    // with no branches, which crashes Mastra's schema-flow pass. Reported by
    // node so the fix is obvious, not as a generic "malformed graph".
    const graph = [
      {
        id: "if-approved",
        predicate: { left: { path: "x" }, op: "eq", right: { literal: true } },
        type: "conditional",
      },
    ];
    expect(codes(graph)).toContain("container-without-steps");
  });

  it("lets a mapping before a conditional supply the first node in each branch", () => {
    // Observed on a live draft: the model puts the mapping outside the branch
    // and the tool inside it. The data really does flow that way — the branch
    // is entered with the conditional's input — so treating the tool_id as
    // "computed" rejected a correct graph.
    const graph = [
      mapping("prep-send", { tool_id: { value: "invoices_send" } }),
      {
        id: "if-approved",
        predicates: [
          { left: { path: "x" }, op: "eq", right: { literal: true } },
        ],
        steps: [toolEntry("send", "engenty_tool")],
        type: "conditional",
      },
    ];
    expect(codes(graph)).not.toContain("dynamic-tool-id");
  });

  it("still rejects a branch tool with no constants anywhere before it", () => {
    const graph = [
      {
        id: "if-approved",
        predicates: [
          { left: { path: "x" }, op: "eq", right: { literal: true } },
        ],
        steps: [toolEntry("send", "engenty_tool")],
        type: "conditional",
      },
    ];
    expect(codes(graph)).toContain("dynamic-tool-id");
  });

  it("accepts a conditional with branches", () => {
    // One entry per branch — the mapping that supplies constants lives OUTSIDE
    // the conditional, because `steps` are alternatives, not a sequence.
    const graph = [
      mapping("prep", { tool_id: { value: "invoices_send" } }),
      {
        id: "if-approved",
        predicates: [
          { left: { path: "x" }, op: "eq", right: { literal: true } },
        ],
        steps: [toolEntry("send", "engenty_tool")],
        type: "conditional",
      },
    ];
    expect(codes(graph)).not.toContain("container-without-steps");
  });

  it("rejects a foreach that uses steps instead of step", () => {
    // The natural slip once you've written a conditional. Produces a container
    // whose body silently never runs.
    const graph = [
      { steps: [toolEntry("send", "engenty_tool")], type: "foreach" },
    ];
    expect(codes(graph)).toContain("container-without-steps");
  });

  it("rejects a conditional whose branch and predicate counts disagree", () => {
    // They pair by position, so a mismatch leaves a branch unguarded or
    // unreachable — invisible on the canvas, the branch just never runs.
    const graph = [
      {
        predicates: [{ left: { path: "x" }, op: "eq", right: { literal: 1 } }],
        steps: [toolEntry("a", "engenty_tool"), toolEntry("b", "engenty_tool")],
        type: "conditional",
      },
    ];
    expect(codes(graph)).toContain("container-without-steps");
  });

  it("rejects a loop with no loopType and no predicate", () => {
    const graph = [{ step: toolEntry("poll", "engenty_tool"), type: "loop" }];
    expect(codes(graph)).toContain("loop-without-condition");
  });

  it("rejects an invented loopType", () => {
    const graph = [
      {
        loopType: "while",
        predicate: { left: { path: "x" }, op: "eq", right: { literal: 1 } },
        step: toolEntry("poll", "engenty_tool"),
        type: "loop",
      },
    ];
    expect(codes(graph)).toContain("loop-without-condition");
  });

  it("accepts a well-formed loop", () => {
    const graph = [
      {
        loopType: "dountil",
        predicate: {
          left: { path: "stepResults.poll.done" },
          op: "eq",
          right: { literal: true },
        },
        step: toolEntry("poll", "engenty_tool"),
        type: "loop",
      },
    ];
    expect(codes(graph)).not.toContain("loop-without-condition");
    expect(codes(graph)).not.toContain("container-without-steps");
  });

  it("rejects a container nested inside a container", () => {
    // `steps`/`step` take a SingleStepEntry, and a container is not one. Mastra
    // is lenient here — it descends and only complains the inner entry has no
    // `id`, which makes an unrunnable graph look nearly-valid.
    const graph = [
      {
        predicates: [{ left: { path: "x" }, op: "eq", right: { literal: 1 } }],
        steps: [{ steps: [toolEntry("a", "engenty_tool")], type: "parallel" }],
        type: "conditional",
      },
    ];
    expect(codes(graph)).toContain("container-in-container");
  });

  it("rejects a container nested in a foreach body", () => {
    const graph = [
      {
        opts: { concurrency: 1 },
        step: { steps: [toolEntry("a", "engenty_tool")], type: "parallel" },
        type: "foreach",
      },
    ];
    expect(codes(graph)).toContain("container-in-container");
  });

  it("rejects an entry with no type at all", () => {
    expect(codes([{ id: "mystery" }])).toContain("unknown-entry-type");
  });

  it("accepts every entry type the engine understands", () => {
    const graph = [
      mapping("prep", { tool_id: { value: "invoices_send" } }),
      toolEntry("send", "engenty_tool"),
    ];
    expect(codes(graph)).not.toContain("unknown-entry-type");
  });
});

describe("validateGraphAction — malformed input", () => {
  it("reports a graph Mastra cannot analyze instead of throwing", () => {
    // Mastra's schema-flow pass walks `entry.steps` unguarded, so a conditional
    // with no steps throws a TypeError inside the library. This function is
    // handed untrusted LLM output, so it has to report that, not crash — a
    // throw here surfaces as a 500 on exactly the input it exists to reject.
    const graph = [{ id: "branch", type: "conditional" }];
    expect(() => codes(graph)).not.toThrow();
    expect(codes(graph)).toContain("mastra");
  });

  it("still reports a graph with an entirely unknown entry type", () => {
    expect(() => codes([{ id: "weird", type: "teleport" }])).not.toThrow();
  });
});

describe("validateGraphAction — durability limits", () => {
  it("rejects a wait longer than the engine can durably hold", () => {
    // 5 days — the shape the design discussion used, and exactly the case
    // that would be silently lost on a deploy today.
    const graph = [{ duration: 432_000_000, id: "wait-5-days", type: "sleep" }];
    expect(codes(graph)).toContain("sleep-too-long");
  });

  it("allows a short wait", () => {
    const graph = [{ duration: 60_000, id: "brief-pause", type: "sleep" }];
    expect(codes(graph)).not.toContain("sleep-too-long");
  });

  it("measures sleepUntil against the clock, not a duration field", () => {
    const farFuture = new Date(Date.now() + 86_400_000).toISOString();
    const graph = [{ date: farFuture, id: "wait-until", type: "sleepUntil" }];
    expect(codes(graph)).toContain("sleep-too-long");
  });

  it("allows an arbitrarily long wait_until — it suspends instead of sleeping", () => {
    // The "chase in 5 days" case. A raw sleep of this length is refused above;
    // the whole point of wait_until is that this same wait is now expressible.
    const graph = [
      mapping("prep-wait", {
        duration_ms: { value: 432_000_000 },
        reason: { value: "waiting for the customer to reply" },
      }),
      toolEntry("wait", "wait_until"),
    ];
    expect(codes(graph)).toHaveLength(0);
  });

  it("accepts an absolute wake time", () => {
    const graph = [
      mapping("prep-wait", {
        until: { value: new Date(Date.now() + 864_000_000).toISOString() },
      }),
      toolEntry("wait", "wait_until"),
    ];
    expect(codes(graph)).not.toContain("wait-without-time");
  });

  it("rejects a wait_until with no constant time", () => {
    // Same constant-arguments rule as every other primitive: a wake time
    // computed at run time can't be read off the canvas.
    const graph = [
      mapping("prep-wait", { reason: { value: "later" } }),
      toolEntry("wait", "wait_until"),
    ];
    expect(codes(graph)).toContain("wait-without-time");
  });

  it("rejects an unparseable absolute wake time", () => {
    const graph = [
      mapping("prep-wait", { until: { value: "next Tuesday-ish" } }),
      toolEntry("wait", "wait_until"),
    ];
    expect(codes(graph)).toContain("wait-without-time");
  });
});

describe("validateGraphAction — deliverable and presentation nodes", () => {
  it("accepts a show_ui node whose surface passes the catalog check", () => {
    const graph = [
      mapping("prep-ui", {
        components: {
          value: [{ id: "root", component: "Text", text: "Done." }],
        },
        title: { value: "Result" },
      }),
      toolEntry("ui", "show_ui"),
    ];
    expect(codes(graph)).not.toContain("invalid-ui-surface");
    expect(codes(graph)).not.toContain("unknown-tool");
  });

  it("rejects a show_ui node with no constant components", () => {
    const graph = [
      mapping("prep-ui", { title: { value: "Result" } }),
      toolEntry("ui", "show_ui"),
    ];
    expect(codes(graph)).toContain("invalid-ui-surface");
  });

  it("rejects a surface past the byte cap at SAVE time", () => {
    const graph = [
      mapping("prep-ui", {
        components: {
          value: [{ id: "root", component: "Text", text: "x".repeat(70_000) }],
        },
      }),
      toolEntry("ui", "show_ui"),
    ];
    expect(codes(graph)).toContain("invalid-ui-surface");
  });

  it("rejects an artifact_write with a type that is not an artifact type", () => {
    const graph = [
      mapping("prep-doc", {
        title: { value: "Weekly brief" },
        type: { value: "pdf" },
        content: { value: "# Brief" },
      }),
      toolEntry("doc", "artifact_write"),
    ];
    expect(codes(graph)).toContain("unknown-artifact-type");
  });

  it("accepts artifact_write with a real type, and show_objects", () => {
    const graph = [
      mapping("prep-doc", {
        title: { value: "Weekly brief" },
        type: { value: "markdown" },
        content: { value: "# Brief" },
      }),
      toolEntry("doc", "artifact_write"),
      mapping("prep-refs", { refs: { value: ["offers:offer:abc"] } }),
      toolEntry("records", "show_objects"),
    ];
    const found = codes(graph);
    expect(found).not.toContain("unknown-artifact-type");
    expect(found).not.toContain("unknown-tool");
  });
});

describe("validateGraphAction — surface gates, inline workflows, wizards", () => {
  const surfacePayload = {
    components: [
      {
        children: ["name", "go"],
        component: "Form",
        id: "root",
        submit: { event: { name: "next" } },
      },
      {
        component: "TextField",
        id: "name",
        label: "Name",
        value: { path: "/name" },
      },
      {
        action: { event: { name: "next" } },
        component: "Button",
        id: "go",
        label: "Weiter",
      },
    ],
    data: { name: "" },
  };

  function surfaceGate(id: string, payload: unknown = surfacePayload) {
    return [
      mapping(`prep-${id}`, {
        kind: { value: "surface" },
        title: { value: "Who?" },
        payload: { value: payload },
      }),
      toolEntry(id, "approval_gate"),
    ];
  }

  it("accepts a surface gate whose page passes the catalog checks", () => {
    expect(codes(surfaceGate("ask"))).toEqual([]);
  });

  it("rejects a surface gate with an unknown component", () => {
    const bad = {
      components: [{ component: "Spinner", id: "root" }],
      data: {},
    };
    expect(codes(surfaceGate("ask", bad))).toContain("invalid-ui-surface");
  });

  it("rejects a surface gate without a components payload", () => {
    expect(codes(surfaceGate("ask", { data: {} }))).toContain(
      "invalid-ui-surface"
    );
  });

  it("a wizard needs at least one gate", () => {
    const graph = [
      mapping("prep", {
        agent_type_key: { value: "offers.manager" },
        brief: { value: "Draft" },
      }),
      toolEntry("draft", "run_specialist"),
    ];
    expect(codes(graph, { surface: "wizard" })).toContain(
      "wizard-without-step"
    );
    expect(codes(graph, { surface: "chat" })).not.toContain(
      "wizard-without-step"
    );
  });

  it("a gate inside an inline loop body counts as the wizard's step", () => {
    const graph = [
      {
        loopType: "dountil",
        predicate: {
          left: { path: "stepResults.draftLoop.event" },
          op: "eq",
          right: { literal: "ok" },
        },
        step: {
          graph: surfaceGate("review"),
          id: "draftLoop",
          type: "workflow",
        },
        type: "loop",
      },
    ];
    const issues = codes(graph, { surface: "wizard" });
    expect(issues).not.toContain("wizard-without-step");
    expect(issues).not.toContain("mastra");
    expect(issues).not.toContain("inline-workflow-invalid");
  });

  it("validates an inline workflow's own entries and reports them under its path", () => {
    const graph = [
      {
        graph: [
          mapping("prep", { tool_id: { value: "x" } }),
          toolEntry("write", "not_a_primitive"),
        ],
        id: "inner",
        type: "workflow",
      },
    ];
    const issues = validateGraphAction(def(graph));
    const unknown = issues.find((issue) => issue.code === "unknown-tool");
    expect(unknown?.path.startsWith("graph.0.graph")).toBe(true);
  });

  it("an inline workflow needs an id and a non-empty graph", () => {
    expect(codes([{ graph: [], id: "inner", type: "workflow" }])).toContain(
      "inline-workflow-invalid"
    );
    expect(codes([{ graph: surfaceGate("ask"), type: "workflow" }])).toContain(
      "inline-workflow-invalid"
    );
  });

  it("a gate inside an inline workflow inside a foreach is still refused", () => {
    const graph = [
      {
        step: { graph: surfaceGate("ask"), id: "each", type: "workflow" },
        type: "foreach",
      },
    ];
    expect(codes(graph)).toContain("gate-in-foreach");
  });
});
