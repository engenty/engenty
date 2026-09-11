// A prompt routine's workflow: one specialist node with the prompt baked in.
//
// A routine always binds a published workflow — that invariant is what keeps
// press, schedule and event fires on one dispatcher. A routine that is "just
// a prompt" keeps it by materializing the smallest workflow there is: the
// `run_specialist` primitive, briefed with the prompt. The prompt is also kept
// verbatim in the definition's metadata, so the UI can show and edit it as
// text without ever opening a canvas. Nothing else is special about the row.
import type { WorkflowStore } from "../../dal/workflows/workflow-store.js";
import {
  AGENT_ENTRY_MARKER,
  translateAgentEntries,
} from "./translate-agent-entries.js";
import type { GraphWorkflowDefinition } from "./validate-graph.js";

export const PROMPT_ROUTINE_METADATA_KEY = "prompt_routine";
export const PROMPT_ROUTINE_MAX_CHARS = 8000;

const NODE_ID = "run";

/** The definition a prompt becomes, ready to validate and store. */
export function promptWorkflowDefinition(input: {
  agentId: string;
  prompt: string;
}): GraphWorkflowDefinition {
  const prompt = input.prompt.trim();
  const graph = translateAgentEntries([
    { agentId: input.agentId, id: NODE_ID, type: "agent" },
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
  return {
    graph,
    id: `prompt:${input.agentId}`,
    metadata: {
      [PROMPT_ROUTINE_METADATA_KEY]: { agent_id: input.agentId, prompt },
    },
  };
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
  const definition = promptWorkflowDefinition({
    agentId: input.agentId,
    prompt: input.prompt,
  });
  const issues = input.validate(definition);
  if (issues.length > 0) {
    throw new PromptWorkflowInvalidError(issues);
  }
  let workflowId = input.workflowId?.trim() || null;
  if (workflowId) {
    const current = await input.store.getCurrent({
      id: workflowId,
      tenantId: input.tenantId,
    });
    if (!(current && isPromptWorkflowGraph(current.version.graph))) {
      workflowId = null;
    }
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
