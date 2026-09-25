// A prompt routine's workflow: the specialist does the work, the platform
// stores the result.
//
// A routine always binds a published workflow — that invariant is what keeps
// press, schedule and event fires on one dispatcher. A routine that is "just
// a prompt" keeps it by materializing a fixed shape: a `run_specialist` step
// briefed with the prompt that answers with the result (title, summary,
// document), then an `artifact_write` step that stores it on the Space. Only
// the first step is a model; storing never depends on the model remembering
// to. Delivery (notification, email, the caller's chat) follows in the settle.
// The prompt is also kept verbatim in the definition's metadata, so the UI can
// show and edit it as text without ever opening a canvas.
import type { WorkflowStore } from "../../dal/workflows/workflow-store.js";
import { ARTIFACT_WRITE_PRIMITIVE_ID } from "./primitive-ids.js";
import { REPORT_STYLE_GUIDE } from "./report-style.js";
import {
  AGENT_ENTRY_MARKER,
  translateAgentEntries,
} from "./translate-agent-entries.js";
import type { GraphWorkflowDefinition } from "./validate-graph.js";

export const PROMPT_ROUTINE_METADATA_KEY = "prompt_routine";
export const PROMPT_ROUTINE_MAX_CHARS = 8000;

const NODE_ID = "run";
const STORE_NODE_ID = "store";

/**
 * What a run leaves behind: a Markdown page, an HTML report (both stored by
 * the store step, one page per title), or rows the specialist writes into a
 * Space table itself — an App on that table shows them.
 */
export const PROMPT_ROUTINE_RESULTS = ["page", "report", "data"] as const;
export type PromptRoutineResult = (typeof PROMPT_ROUTINE_RESULTS)[number];

const SUMMARY_FIELD = {
  description:
    "Two or three sentences: what you found or did. It becomes the notification.",
  type: "string",
} as const;

const TITLE_FIELD = {
  description:
    "The result's title, with the date when it is one of a series. A run with the same title updates that page instead of adding another.",
  type: "string",
} as const;

/**
 * What the chat card shows of a result, whatever format the document is in.
 * Optional: the card is composed from what is there.
 */
const CARD_FIELDS = {
  attention: {
    description:
      "One sentence on the one thing the person must act on or watch, if there is one. Leave out otherwise.",
    type: "string",
  },
  headline: {
    description:
      "The most important thing this run found, as a headline of at most ten words — not the document's title.",
    type: "string",
  },
  highlights: {
    description:
      "Up to five findings, one sentence each, most important first. Start each with its key term in **bold**.",
    items: { type: "string" },
    type: "array",
  },
  meta: {
    description:
      "One short line of context shown small under the headline: the period covered, what was checked, as of when.",
    type: "string",
  },
  key_figures: {
    description:
      "Up to six figures the result turns on. value is short — a number, price, date or one-word state; note adds the context in a few words. Leave out when there are none.",
    items: {
      properties: {
        label: { type: "string" },
        note: { type: "string" },
        value: { type: "string" },
      },
      required: ["label", "value"],
      type: "object",
    },
    type: "array",
  },
  sections: {
    description:
      "The document's parts, up to six: each heading and its gist in one sentence.",
    items: {
      properties: { line: { type: "string" }, title: { type: "string" } },
      required: ["title", "line"],
      type: "object",
    },
    type: "array",
  },
  status: {
    description:
      'The state at a glance in one to three words ("No changes", "Price increase"), with status_tone.',
    type: "string",
  },
  status_tone: {
    description: "good news, something to watch, or neither.",
    enum: ["good", "watch", "neutral"],
    type: "string",
  },
} as const;

const DOCUMENT_FIELD: Record<"page" | "report", string> = {
  page: "The full result in Markdown — what the person opens and reads.",
  report: `The full result as one complete HTML document, no scripts — what the person opens and reads. ${REPORT_STYLE_GUIDE}`,
};

/** What the specialist step answers; the store step reads it field by field. */
export function promptRoutineResultSchema(result: PromptRoutineResult) {
  if (result === "data") {
    return {
      properties: { ...CARD_FIELDS, summary: SUMMARY_FIELD },
      required: ["summary"],
      type: "object",
    };
  }
  return {
    properties: {
      ...CARD_FIELDS,
      document: { description: DOCUMENT_FIELD[result], type: "string" },
      summary: SUMMARY_FIELD,
      title: TITLE_FIELD,
    },
    required: ["title", "summary", "document"],
    type: "object",
  };
}

/** The definition a prompt becomes, ready to validate and store. */
export function promptWorkflowDefinition(input: {
  agentId: string;
  prompt: string;
  result?: PromptRoutineResult;
}): GraphWorkflowDefinition {
  const prompt = input.prompt.trim();
  const result = input.result ?? "page";
  const work = translateAgentEntries([
    {
      agentId: input.agentId,
      id: NODE_ID,
      outputSchema: promptRoutineResultSchema(result),
      type: "agent",
    },
  ]).map((entry) => {
    if (entry.type !== "mapping" || typeof entry.mapConfig !== "string") {
      return entry;
    }
    // The translation briefs the node with the run input (an agent chain's
    // semantics); a prompt routine briefs it with the prompt. The event or
    // static input still rides along as structured context.
    const mapConfig = JSON.parse(entry.mapConfig) as Record<string, unknown>;
    mapConfig.brief = { value: prompt };
    return { ...entry, mapConfig: JSON.stringify(mapConfig) };
  });
  const fromRun = (field: string) => ({
    path: `output.${field}`,
    step: NODE_ID,
  });
  // Data lands in the table during the work; there is no document to store.
  const store =
    result === "data"
      ? []
      : [
          {
            id: `${STORE_NODE_ID}__prepare`,
            mapConfig: JSON.stringify({
              answer: { path: "output", step: NODE_ID },
              content: fromRun("document"),
              entry_id: { value: STORE_NODE_ID },
              store_to: { value: { scope_type: "space" } },
              summary: fromRun("summary"),
              title: fromRun("title"),
              type: { value: result === "report" ? "html" : "markdown" },
              update_same_title: { value: true },
              ...(result === "report" ? { house_style: { value: true } } : {}),
            }),
            type: "mapping",
          },
          {
            id: STORE_NODE_ID,
            toolId: ARTIFACT_WRITE_PRIMITIVE_ID,
            type: "tool",
          },
        ];
  return {
    graph: [...work, ...store],
    id: `prompt:${input.agentId}`,
    metadata: {
      [PROMPT_ROUTINE_METADATA_KEY]: {
        agent_id: input.agentId,
        prompt,
        result,
      },
    },
  };
}

/** The result a stored prompt routine produces; "page" when it predates the choice. */
export function resultOfWorkflowGraph(
  graph: Record<string, unknown> | null | undefined
): PromptRoutineResult {
  const metadata = graph?.metadata as Record<string, unknown> | undefined;
  const entry = metadata?.[PROMPT_ROUTINE_METADATA_KEY] as
    | { result?: unknown }
    | undefined;
  return PROMPT_ROUTINE_RESULTS.find((r) => r === entry?.result) ?? "page";
}

/** The prompt a stored version carries, or null for a canvas workflow. */
export function promptOfWorkflowGraph(
  graph: Record<string, unknown> | null | undefined
): string | null {
  const metadata = graph?.metadata;
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  const entry = (metadata as Record<string, unknown>)[
    PROMPT_ROUTINE_METADATA_KEY
  ];
  const prompt =
    entry && typeof entry === "object"
      ? (entry as { prompt?: unknown }).prompt
      : undefined;
  return typeof prompt === "string" && prompt.trim() ? prompt : null;
}

/** True when the stored graph is the one-node shape this module writes. */
export function isPromptWorkflowGraph(
  graph: Record<string, unknown> | null | undefined
): boolean {
  if (promptOfWorkflowGraph(graph) === null) {
    return false;
  }
  const steps = Array.isArray(graph?.graph) ? graph.graph : [];
  return steps.some(
    (step) =>
      step &&
      typeof step === "object" &&
      (step as { type?: unknown }).type === "mapping" &&
      typeof (step as { mapConfig?: unknown }).mapConfig === "string" &&
      ((step as { mapConfig: string }).mapConfig as string).includes(
        AGENT_ENTRY_MARKER
      )
  );
}

function workflowName(routineName: string): string {
  const slug = routineName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  // (tenant, owner, name) is unique; a routine may be renamed or re-created
  // under the same name, so the row carries its own suffix.
  return `${slug || "routine"}-${crypto.randomUUID().slice(0, 8)}`;
}

export interface MaterializePromptWorkflowInput {
  agentId: string;
  prompt: string;
  /** What a run leaves behind; a re-brief keeps the current one when absent. */
  result?: PromptRoutineResult;
  /** The routine's name — the workflow's title, and the seed of its name. */
  routineName: string;
  store: Pick<
    WorkflowStore,
    "create" | "getCurrent" | "publishVersion" | "saveVersion"
  >;
  tenantId: string;
  userId: string | null;
  validate: (definition: GraphWorkflowDefinition) => { message: string }[];
  /**
   * Re-brief an existing prompt workflow (a new version on the same row)
   * instead of minting a row. Only for a row this module wrote.
   */
  workflowId?: string | null;
}

export class PromptWorkflowInvalidError extends Error {
  readonly issues: { message: string }[];
  constructor(issues: { message: string }[]) {
    super(
      `prompt_workflow_invalid: ${issues.map((i) => i.message).join("; ")}`
    );
    this.name = "PromptWorkflowInvalidError";
    this.issues = issues;
  }
}

/**
 * Write and publish the workflow a prompt routine binds. Published by the
 * person creating the routine — the same act the canvas's Publish is — so
 * the routine can fire the moment it exists.
 */
export async function materializePromptWorkflow(
  input: MaterializePromptWorkflowInput
): Promise<{ workflowId: string }> {
  let workflowId = input.workflowId?.trim() || null;
  let currentResult: PromptRoutineResult | undefined;
  if (workflowId) {
    const current = await input.store.getCurrent({
      id: workflowId,
      tenantId: input.tenantId,
    });
    if (current && isPromptWorkflowGraph(current.version.graph)) {
      currentResult = resultOfWorkflowGraph(current.version.graph);
    } else {
      workflowId = null;
    }
  }
  const definition = promptWorkflowDefinition({
    agentId: input.agentId,
    prompt: input.prompt,
    result: input.result ?? currentResult ?? "page",
  });
  const issues = input.validate(definition);
  if (issues.length > 0) {
    throw new PromptWorkflowInvalidError(issues);
  }
  if (!workflowId) {
    const row = await input.store.create({
      createdByUserId: input.userId,
      description: null,
      name: workflowName(input.routineName),
      ownerAgentId: input.agentId,
      tenantId: input.tenantId,
      title: input.routineName,
    });
    workflowId = row.id;
  }
  const version = await input.store.saveVersion({
    authoredBy: "user",
    createdByUserId: input.userId,
    graph: { ...definition, id: `workflow:${workflowId}` },
    tenantId: input.tenantId,
    workflowId,
  });
  await input.store.publishVersion({
    approvedByUserId: input.userId,
    tenantId: input.tenantId,
    versionId: version.id,
  });
  return { workflowId };
}
