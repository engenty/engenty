// Turn a sentence into a flow.
//
// The create dialog's whole promise is that describing a flow is enough to get
// one drawn. That makes this the form-shaped sibling of `workflow_propose`:
// same guidance, same validation, same governance — the version is saved
// UNAPPROVED and a human still publishes it on the canvas. Nothing here can put
// a graph into production, which is what lets the drafting itself be automatic.
//
// One repair round is built in. A model writing declarative graph JSON gets the
// constant-arguments rule wrong often enough that a single retry carrying the
// exact issue list turns most failures into successes — and when it still
// fails, returning the issues beats returning nothing: the user lands on a
// canvas with problems marked on the nodes, which is a place to work from.

import { randomUUID } from "node:crypto";
import { ENGENTY_COPILOT_AGENT_ID } from "@engenty/engenty-copilot/ai";
import { createLogger } from "@engenty/telemetry";
import { createDefaultAiRegistry } from "../agents.js";
import { runDelegatedConversation } from "../conversation/delegate-run.js";
import {
  createAgentRunStoreFromEnv,
  createRegistryStoreFromEnv,
  createThreadStoreFromEnv,
} from "../index.js";
import { createDefaultModuleCapabilityLoader } from "../module-capability-loader.js";
import type { RuntimeModelConfig } from "../registry/index.js";
import { registerActiveRunAbortController } from "../sessions/run-abort-registry.js";
import { ensureAgentRunStarted } from "../sessions/run-tracking.js";
import type { AiSessionScope } from "../sessions/types.js";
import { GRAPH_GUIDANCE } from "./authoring-guidance.js";
import { resolveGraphRunModelConfig } from "./model-config.js";
import {
  type GraphValidationIssue,
  type ValidateGraphActionOptions,
  validateGraphAction,
} from "./validate-graph.js";

const logger = createLogger({ name: "graph-action-drafter" });

export interface DraftGraphInput {
  contextType?: string | null;
  /** The user's own words — the thing the flow should do. */
  description: string;
  name: string;
  /**
   * Client-supplied observe id for the FIRST drafting round. Attach
   * `GET /ai/v1/runs/:id/stream` to watch the draft being written; a repair
   * round stays anonymous (its stream would start after the first one closed,
   * and a client waiting on an id that may never exist reads as a lost stream).
   * Cancellation via this id covers BOTH rounds — one abort controller spans
   * the whole draft.
   */
  runId?: string;
  scope: AiSessionScope;
  /** Capability-aware validation bound to the requesting user. */
  validation?: ValidateGraphActionOptions;
}

export interface DraftGraphResult {
  /** True when the chat tier drafted because no planning tier is bound. */
  draftedWithFallbackTier?: boolean;
  graph: {
    graph: unknown[];
    id: string;
    inputSchema: Record<string, unknown>;
    outputSchema: Record<string, unknown>;
  };
  /** Problems that survived the repair round. Empty on a clean draft. */
  issues: GraphValidationIssue[];
}

const OUTPUT_CONTRACT = `
Respond with ONLY a JSON object, no prose and no code fence:
{
  "graph": [ ...entries... ],
  "input_schema": { "type": "object", "properties": { ... } },
  "output_schema": { "type": "object", "properties": { ... } }
}
The reply must be strictly valid JSON — one unbalanced brace discards the
whole graph. Check your bracket balance before finishing.
`.trim();

/** Exported for tests — the brief IS the repair contract. */
export function buildBrief(input: {
  contextType?: string | null;
  description: string;
  /** The user's own guidance for HOW to fix — only meaningful with `issues`. */
  instruction?: string;
  issues?: GraphValidationIssue[];
  name: string;
  previous?: string;
}): string {
  const parts = [
    "Design a multi-step Workflow as a declarative graph.",
    `Name: ${input.name}`,
    `What it should do: ${input.description}`,
  ];
  if (input.contextType) {
    parts.push(
      `It runs against a subject of type "${input.contextType}" — the run's ` +
        "subject is supplied by the request context, so do NOT put an id in the graph."
    );
  }
  parts.push(GRAPH_GUIDANCE);
  if (input.issues?.length && input.previous) {
    parts.push(
      "Your previous attempt did not validate. Here it is:",
      input.previous,
      "Fix exactly these problems and return the corrected graph:",
      input.issues
        .map((issue) => `- [${issue.code}] ${issue.message} (at ${issue.path})`)
        .join("\n")
    );
    if (input.instruction) {
      parts.push(
        "The user added this instruction for the fix — follow it:\n" +
          input.instruction
      );
    }
  } else if (input.previous && input.instruction) {
    // A pure EDIT round: the graph is valid, the user described a change.
    // The previous graph must ride along or the model redraws from scratch
    // and loses everything the instruction did not mention.
    parts.push(
      "Here is the current graph. It is valid — keep everything the change does not touch:",
      input.previous,
      "Apply exactly this change and return the full updated graph:\n" +
        input.instruction
    );
  }
  parts.push(OUTPUT_CONTRACT);
  return parts.join("\n\n");
}

/**
 * Pull the JSON object out of a model reply.
 *
 * Tolerant of a code fence and of surrounding prose, because "no prose" in the
 * contract is a request, not a guarantee — and failing a whole draft over a
 * stray "Here you go:" would be a poor trade.
 */
function extractJsonObject(text: string): Record<string, unknown> | undefined {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return;
  }
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return;
  }
}

function asSchema(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : { properties: {}, type: "object" };
}

/**
 * Pin this run to the tenant's PLANNING & CODING tier.
 *
 * Without this the drafting run inherits the copilot's own declared
 * `purpose: "routing"` — and worse, `assembleDynamicAgent` short-circuits to the
 * agent's compiled-in default when no `modelConfig` is supplied at all, so the
 * tenant's configured bindings were bypassed entirely. Writing declarative graph
 * JSON against a strict schema is planning/coding work, not routing work, and
 * the difference showed: the shapes the validator now rejects (a toolId used as
 * an entry type, a conditional written as an inline if) are exactly the mistakes
 * a router-tier model makes.
 *
 * All three ids are set to the same model deliberately. The copilot resolves by
 * its OWN purpose, so `routingModelId` is the field it actually reads — pinning
 * only `planningCodingModelId` would change nothing. This says "run this
 * delegation at planning quality" without editing the shared agent's purpose,
 * which would affect every other copilot turn.
 */
async function resolveDraftingModelConfig(scope: AiSessionScope): Promise<{
  config: RuntimeModelConfig;
  /**
   * True when no planning tier is bound and the chat tier drafted instead.
   * Surfaced to the canvas: the shapes the validator rejects are exactly the
   * mistakes a weaker tier makes, and a weak-tier single-node draft is
   * otherwise indistinguishable from a correct one.
   */
  usedFallbackTier: boolean;
}> {
  const base = await resolveGraphRunModelConfig(scope);
  // The planning tier is optional in the config; its documented fallback is
  // the chat tier, and spelling that out here keeps both ids `string`.
  const usedFallbackTier = !base.planningCodingModelId;
  const modelId = base.planningCodingModelId ?? base.chatModelId;
  return {
    config: {
      ...base,
      chatModelId: modelId,
      routingModelId: modelId,
    },
    usedFallbackTier,
  };
}

/**
 * Draft a graph from a natural-language description.
 *
 * Throws when the model produced nothing usable at all; returns `issues` when
 * it produced a graph that is merely wrong, because those are different
 * situations for the caller: the first has no canvas to show, the second does.
 */
export async function draftGraphFromDescription(
  input: DraftGraphInput
): Promise<DraftGraphResult> {
  const session = await createDraftingSession({
    runId: input.runId,
    scope: input.scope,
    title: `Drafting Action — ${input.name}`,
  });
  const result = await session.run((abortSignal) =>
    draftRounds(input, session.runOnce, abortSignal)
  );
  return session.usedFallbackTier
    ? { ...result, draftedWithFallbackTier: true }
    : result;
}

/** Sentinel message the route maps to a distinct "you stopped this" response. */
export const DRAFT_CANCELLED = "draft_cancelled";

interface DraftingSession {
  /** Wraps the model rounds: maps an abort to DRAFT_CANCELLED, cleans up. */
  run: <T>(rounds: (abortSignal?: AbortSignal) => Promise<T>) => Promise<T>;
  runOnce: (brief: string, roundRunId: string) => Promise<string>;
  /** No planning tier bound — the chat tier drafted. Rides the result. */
  usedFallbackTier: boolean;
}

/**
 * Everything a drafting-style delegation needs before any model round runs,
 * shared by drafting and repairing — duplicated abort plumbing is how cancel
 * quietly stops working for one of the two.
 *
 * With a client-supplied id, the run row is inserted BEFORE any work: the
 * stream endpoint 404s on an unknown run, and the row otherwise appears lazily
 * on the first event — a race the watching client would experience as a 404
 * retry loop. The abort registration is what makes `POST /runs/:id/cancel`
 * actually stop the work instead of merely marking the row cancelled.
 */
async function createDraftingSession(params: {
  runId?: string | undefined;
  scope: AiSessionScope;
  title: string;
}): Promise<DraftingSession> {
  const store = createThreadStoreFromEnv();
  if (!store) {
    throw new Error("action graph drafting needs the agent session store");
  }
  const registry = createDefaultAiRegistry({
    databaseStore: createRegistryStoreFromEnv(),
    moduleLoader: createDefaultModuleCapabilityLoader(),
    tenantId: params.scope.tenantId,
  });

  // Its own thread: drafting is not part of any conversation the user is
  // having, and threading it into one would put graph JSON in their chat.
  const { thread } = await store.createThread({
    agentId: ENGENTY_COPILOT_AGENT_ID,
    createdByUserId: params.scope.userId ?? null,
    tenantId: params.scope.tenantId,
    title: params.title,
  });

  const { config: modelConfig, usedFallbackTier } =
    await resolveDraftingModelConfig(params.scope);
  logger.info("starting a drafting session", {
    modelId: modelConfig.routingModelId,
    usedFallbackTier,
    tenantId: params.scope.tenantId,
    title: params.title,
  });

  let abort: ReturnType<typeof registerActiveRunAbortController> | undefined;
  if (params.runId) {
    await ensureAgentRunStarted(createAgentRunStoreFromEnv(), {
      agentId: ENGENTY_COPILOT_AGENT_ID,
      createdByUserId: params.scope.userId ?? null,
      id: params.runId,
      modelId: modelConfig.routingModelId,
      tenantId: params.scope.tenantId,
      threadId: thread.id,
      // The canvas asked for a draft; no chat turn produced this.
      trigger: "direct",
    });
    abort = registerActiveRunAbortController(params.runId);
  }

  const runOnce = async (brief: string, roundRunId: string) => {
    const result = await runDelegatedConversation({
      brief,
      childAgentId: ENGENTY_COPILOT_AGENT_ID,
      childRunId: roundRunId,
      childThreadId: thread.id,
      modelConfig,
      observe: {
        runStore: createAgentRunStoreFromEnv(),
        tenantId: params.scope.tenantId,
      },
      registry,
      scope: params.scope,
      store,
      ...(abort ? { abortSignal: abort.abortSignal } : {}),
    });
    if (result.error) {
      throw new Error(`Action drafting failed — ${result.error}`);
    }
    return result.finalText;
  };

  return {
    run: async (rounds) => {
      try {
        return await rounds(abort?.abortSignal);
      } catch (err) {
        // A cancelled round must not surface as "drafting failed" — the user
        // asked for exactly this outcome and the route answers it distinctly.
        if (abort?.abortSignal.aborted) {
          throw new Error(DRAFT_CANCELLED);
        }
        throw err;
      } finally {
        abort?.cleanup();
      }
    },
    runOnce,
    usedFallbackTier,
  };
}

/**
 * The two model rounds: draft, and — when validation complains — one repair.
 * Split from the setup above only so cancellation can wrap both rounds in a
 * single try/finally without indenting the whole drafting logic.
 */
async function draftRounds(
  input: DraftGraphInput,
  runOnce: (brief: string, roundRunId: string) => Promise<string>,
  abortSignal?: AbortSignal
): Promise<DraftGraphResult> {
  let reply = await runOnce(
    buildBrief({
      description: input.description,
      name: input.name,
      ...(input.contextType ? { contextType: input.contextType } : {}),
    }),
    input.runId ?? randomUUID()
  );
  const parsed = extractJsonObject(reply);
  if (!(parsed && Array.isArray(parsed.graph))) {
    throw new Error("the model did not return a graph");
  }

  const build = (source: Record<string, unknown>) => ({
    graph: source.graph as unknown[],
    id: "workflow:pending",
    inputSchema: asSchema(source.input_schema),
    outputSchema: asSchema(source.output_schema),
  });

  let graph = build(parsed);
  let issues = validateGraphAction(graph, input.validation);

  if (issues.length > 0) {
    logger.info("draft did not validate — attempting one repair round", {
      issueCodes: issues.map((issue) => issue.code),
      tenantId: input.scope.tenantId,
    });
    try {
      reply = await runOnce(
        buildBrief({
          description: input.description,
          issues,
          name: input.name,
          previous: JSON.stringify(graph.graph),
          ...(input.contextType ? { contextType: input.contextType } : {}),
        }),
        randomUUID()
      );
      const repaired = extractJsonObject(reply);
      if (repaired && Array.isArray(repaired.graph)) {
        const candidate = build(repaired);
        const candidateIssues = validateGraphAction(
          candidate,
          input.validation
        );
        // Keep the repair only if it actually helped. A "fix" that trades three
        // problems for four would otherwise be handed to the user as progress.
        if (candidateIssues.length < issues.length) {
          graph = candidate;
          issues = candidateIssues;
        }
      }
    } catch (err) {
      // A cancel during repair is a cancel of the whole draft — handing back
      // the first draft would create the flow the user just stopped.
      if (abortSignal?.aborted) {
        throw err;
      }
      // The first draft still stands — a failed repair is not a failed draft.
      logger.warn("repair round failed; keeping the first draft", {
        error: err instanceof Error ? err.message : String(err),
        tenantId: input.scope.tenantId,
      });
    }
  }

  return { graph, issues };
}

export interface RepairGraphInput {
  contextType?: string | null;
  /** The flow's stored description; the name stands in when there is none. */
  description: string | null;
  graph: DraftGraphResult["graph"];
  /** The user's guidance for HOW to fix, when they gave any. */
  instruction?: string;
  /** Freshly validated server-side — never a client-supplied list. */
  issues: GraphValidationIssue[];
  name: string;
  /** Client-supplied observe id — repair is a single round, so it streams it. */
  runId?: string;
  scope: AiSessionScope;
  validation?: ValidateGraphActionOptions;
}

export interface RepairGraphResult {
  graph: DraftGraphResult["graph"];
  /**
   * False when the round didn't reduce the issue count — the caller then has
   * the ORIGINAL graph and issues back, and should not mint a version for it:
   * a v(N+1) identical to vN presents zero progress as progress.
   */
  improved: boolean;
  issues: GraphValidationIssue[];
}

/**
 * One repair round against an existing stored graph — the standalone face of
 * the repair the drafter already runs internally, so the "N to fix" badge can
 * do something about the N.
 */
export async function repairGraphIssues(
  input: RepairGraphInput
): Promise<RepairGraphResult> {
  // Zero issues + an instruction = an EDIT round (there is no manual node
  // editor — describing the change IS how a flow is edited). Zero issues and
  // no instruction is genuinely nothing to do.
  const isEdit = input.issues.length === 0;
  if (isEdit && !input.instruction?.trim()) {
    return { graph: input.graph, improved: false, issues: [] };
  }
  const session = await createDraftingSession({
    runId: input.runId,
    scope: input.scope,
    title: isEdit
      ? `Editing Action — ${input.name}`
      : `Fixing Action — ${input.name}`,
  });
  return await session.run(async () => {
    const reply = await session.runOnce(
      buildBrief({
        description: input.description?.trim() || input.name,
        issues: input.issues,
        name: input.name,
        previous: JSON.stringify(input.graph.graph),
        ...(input.contextType ? { contextType: input.contextType } : {}),
        ...(input.instruction ? { instruction: input.instruction } : {}),
      }),
      input.runId ?? randomUUID()
    );
    const repaired = extractJsonObject(reply);
    if (!(repaired && Array.isArray(repaired.graph))) {
      // Seen live: one surplus closing brace is all it takes. Without this
      // line every no-improvement looks identical from the outside.
      logger.warn("repair reply was not a parseable graph", {
        replyBytes: reply.length,
        tenantId: input.scope.tenantId,
      });
      return { graph: input.graph, improved: false, issues: input.issues };
    }
    const candidate = {
      // Everything the repair brief never mentions — description, metadata,
      // the state and request-context schemas — rides through untouched.
      ...input.graph,
      graph: repaired.graph as unknown[],
      id: input.graph.id,
      // The repair brief only carries the entries, so a model that omits the
      // schemas hasn't dropped them — the stored ones carry over.
      inputSchema: repaired.input_schema
        ? asSchema(repaired.input_schema)
        : input.graph.inputSchema,
      outputSchema: repaired.output_schema
        ? asSchema(repaired.output_schema)
        : input.graph.outputSchema,
    };
    const candidateIssues = validateGraphAction(candidate, input.validation);
    // Edit bar: the result must still be VALID (it started valid — a change
    // that breaks the graph is not an edit) and actually different (an
    // identical reply minted as v(N+1) presents zero progress as progress).
    if (isEdit) {
      const changed =
        JSON.stringify(candidate.graph) !== JSON.stringify(input.graph.graph);
      if (changed && candidateIssues.length === 0) {
        return { graph: candidate, improved: true, issues: candidateIssues };
      }
      logger.info("edit round rejected", {
        changed,
        issues: candidateIssues.map((issue) => issue.code),
        tenantId: input.scope.tenantId,
      });
      return { graph: input.graph, improved: false, issues: input.issues };
    }
    // Repair bar, as before: strictly fewer issues. The instruction guides
    // HOW to fix; an equal-count result fixed nothing.
    if (candidateIssues.length < input.issues.length) {
      return { graph: candidate, improved: true, issues: candidateIssues };
    }
    logger.info("repair round did not improve", {
      after: candidateIssues.map((issue) => issue.code),
      before: input.issues.map((issue) => issue.code),
      tenantId: input.scope.tenantId,
    });
    return { graph: input.graph, improved: false, issues: input.issues };
  });
}
