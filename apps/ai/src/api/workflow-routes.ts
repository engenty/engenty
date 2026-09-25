// Flow graph HTTP surface — definitions, versions, publish, runs, gates.
//
//   POST   /ai/v1/workflows                    create a definition
//   POST   /ai/v1/workflows/draft              create + author from a description
//   GET    /ai/v1/workflows                    list (optionally by subject)
//   GET    /ai/v1/workflows/:id                definition + versions
//   PATCH  /ai/v1/workflows/:id                rename / re-describe
//   DELETE /ai/v1/workflows/:id                remove (guarded by runs)
//   POST   /ai/v1/workflows/validate           preflight — no save
//   POST   /ai/v1/workflows/:id/versions       mint a version (validated)
//   POST   /ai/v1/workflows/:id/publish        approve + point at a version
//   POST   /ai/v1/workflows/:id/run            run the published version
//   POST   /ai/v1/workflows/runs/:runId/resume answer a gate
//   POST   /ai/v1/workflows/runs/:runId/review release a held run (report: ask)
//   GET    /ai/v1/workflows/:id/repair … and the rest, all under one base.
//
// RENAME ring 3 (2026-08-24): the base moved from /v1/action-graphs. No
// compatibility redirect — nothing is deployed off this branch.
import { createLogger } from "@engenty/telemetry";
import type { Hono } from "hono";
import type { SpaceGateContext } from "../../ai/tools/engenty-tools/lib/space-gate.js";
import {
  createRoutineStoreFromEnv,
  createThreadStoreFromEnv,
} from "../ai/index.js";
import { releaseReviewedRun } from "../ai/routines/review-hold.js";
import { wrapPublishedWorkflow } from "../ai/routines/wrap-workflow.js";
import {
  resolveRunSpaceById,
  resolveRunSpaceForThread,
  toolsSpaceFromResolution,
} from "../ai/sessions/run-space.js";
import {
  type AiSessionScope,
  scopeAccessToken,
  scopeCoversCapability,
} from "../ai/sessions/types.js";
import { capabilityForModuleOperation } from "../ai/workflows/capabilities.js";
import {
  cancelGraphRun,
  type GraphRunOutcome,
  readGraphRunSnapshot,
  resumeGraphRun,
  timeTravelGraphRun,
} from "../ai/workflows/dispatch.js";
import { dispatchPublishedWorkflowRun } from "../ai/workflows/dispatch-published-run.js";
import {
  DRAFT_CANCELLED,
  draftGraphFromDescription,
  repairGraphIssues,
} from "../ai/workflows/draft-from-description.js";
import {
  FlowInputMissingError,
  FlowInputShapeError,
} from "../ai/workflows/flow-input.js";
import { generateWorkflowTitle } from "../ai/workflows/generate-workflow-title.js";
import { resumeAnswererAls } from "../ai/workflows/resume-answerer.js";
import {
  approvalPolicyForRun,
  type GraphApprovalPolicy,
} from "../ai/workflows/run-context.js";
import { settleGraphRun } from "../ai/workflows/run-lifecycle.js";
import { mirrorFlowDecisionToTask } from "../ai/workflows/task-mirror.js";
import { translateAgentEntries } from "../ai/workflows/translate-agent-entries.js";
import {
  type GraphWorkflowDefinition,
  validateGraphAction,
} from "../ai/workflows/validate-graph.js";
import { AI_BASE_PATH } from "../config/constants.js";
import type {
  WorkflowRunRow,
  WorkflowRunStore,
} from "../dal/workflow-runs/workflow-run-store.js";
import type {
  WorkflowStore,
  WorkflowSurface,
  WorkflowVersionRow,
} from "../dal/workflows/index.js";
import type { AiScopeResolver } from "./http.js";
import { handleRouteError, resolveScope, uuidString } from "./http.js";

const logger = createLogger({ name: "workflow-routes" });

/** Postgres' unique-violation on the (tenant, owner, name) index. */
function isDuplicateNameError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("workflow_tenant_owner_name_idx") ||
    message.includes("workflow_tenant_name_idx")
  );
}

export interface RegisterWorkflowRoutesOptions {
  getWorkflowRunStore: () => WorkflowRunStore | null;
  getWorkflowStore: () => WorkflowStore | null;
  scopeResolver: AiScopeResolver;
}

/** Validation options bound to the caller — the author is who gets checked. */
function validationOptionsFor(
  scope: AiSessionScope,
  surface?: WorkflowSurface
) {
  return {
    capabilityForOperation: capabilityForModuleOperation,
    holdsCapability: (capabilityId: string) =>
      scopeCoversCapability(scope, capabilityId),
    ...(surface ? { surface } : {}),
  };
}

/** `surface` from a request body, when it names a legal value. */
function surfaceField(body: Record<string, unknown>): {
  surface?: WorkflowSurface;
} {
  return body.surface === "wizard" || body.surface === "chat"
    ? { surface: body.surface }
    : {};
}

/**
 * The step a resume or a step-back targets: `step_path` (an array into a
 * nested workflow) wins over `step_id` (a top-level id).
 */
function stepTarget(body: Record<string, unknown>): {
  stepId?: string | string[];
} {
  if (
    Array.isArray(body.step_path) &&
    body.step_path.length > 0 &&
    body.step_path.every((part) => typeof part === "string")
  ) {
    return { stepId: body.step_path as string[] };
  }
  return typeof body.step_id === "string" ? { stepId: body.step_id } : {};
}

/** The run row and its pinned version, or the response that says why not. */
async function locateRun(
  ctx: { scope: AiSessionScope; store: WorkflowStore },
  requests: WorkflowRunStore | null,
  runId: string
): Promise<
  | { ok: true; request: WorkflowRunRow; version: WorkflowVersionRow }
  | { error: string; ok: false; status: 404 | 410 }
> {
  const request = await requests?.getByRunId({
    runId,
    tenantId: ctx.scope.tenantId,
  });
  if (!(request?.workflow_version_id && request.workflow_id)) {
    return { error: "workflows.runNotFound", ok: false, status: 404 };
  }
  const version = await ctx.store.getVersion({
    id: request.workflow_version_id,
    tenantId: ctx.scope.tenantId,
  });
  if (!version) {
    // The pinned version is gone — the run cannot continue on a different
    // graph, so fail loudly rather than silently substituting.
    return { error: "workflows.pinnedVersionMissing", ok: false, status: 410 };
  }
  return { ok: true, request, version };
}

/**
 * The Space a parked run continues in, resolved with the ANSWERER's scope.
 *
 * Whoever may act in the run's Space may answer — core's `requireSpaceAccess`
 * is the gate, so nothing here re-invents membership. The resolution is also
 * what the continuing run carries as its Space: resolved once, here, where a
 * person is present, because the run's own footing has no user and could not
 * resolve a Space-scoped thread on its own. A run outside any Space stays
 * tenant-global.
 */
async function resolveAnswererSpace(
  scope: AiSessionScope,
  request: WorkflowRunRow
): Promise<
  | { ok: true; space: SpaceGateContext | null }
  | { error: "workflows.spaceForbidden"; ok: false }
> {
  const threadStore = createThreadStoreFromEnv();
  if (!(request.thread_id && threadStore)) {
    return { ok: true, space: null };
  }
  const resolution = await resolveRunSpaceForThread({
    scope,
    store: threadStore,
    threadId: request.thread_id,
  });
  if (resolution.kind === "unresolved") {
    return { error: "workflows.spaceForbidden", ok: false };
  }
  return { ok: true, space: toolsSpaceFromResolution(resolution) };
}

/**
 * Continue a parked run without holding the request open.
 *
 * What follows a gate can be a specialist drafting for a minute or a wait of
 * days, so the answer is acknowledged at once and the run carries on the way
 * a press does: in the background, settled through the one lifecycle funnel,
 * watched by the client over the run's event stream and snapshot. A crash in
 * the continuation settles as a failure rather than a run stuck on
 * `requires_action`.
 */
function continueInBackground(input: {
  continue: () => Promise<GraphRunOutcome>;
  initiatorUserId: string | null;
  request: WorkflowRunRow;
  runId: string;
  space: SpaceGateContext | null;
  tenantId: string;
  version: WorkflowVersionRow;
}): void {
  void (async () => {
    let outcome: GraphRunOutcome;
    try {
      outcome = await input.continue();
    } catch (err) {
      outcome = {
        reason: err instanceof Error ? err.message : String(err),
        status: "failed",
      };
    }
    try {
      await settleGraphRun({
        initiatorUserId: input.initiatorUserId,
        outcome,
        outputSchema: input.version.output_schema,
        requestId: input.request.id,
        runId: input.runId,
        space: input.space,
        tenantId: input.tenantId,
      });
    } catch (err) {
      logger.error("graph run continuation settle failed", {
        error: err instanceof Error ? err.message : String(err),
        runId: input.runId,
      });
    }
  })();
}

/**
 * The Space a press claims, from the body's `space_id`.
 *
 * A press comes from a page inside a Space, and the run has to be dispatched
 * WITH it: the alternative is a run whose thread has no Space, which reads
 * back later as "this run belongs nowhere".
 */
async function pressedRunSpace(
  scope: AiSessionScope,
  body: Record<string, unknown>,
  header: string | undefined
): Promise<
  | { ok: true; space: SpaceGateContext | null }
  | { error: "workflows.spaceForbidden"; ok: false }
> {
  // Same claim the chat lane and the by-source press read: the header first,
  // the body for callers that cannot set one.
  const spaceId =
    header?.trim() ||
    (typeof body.space_id === "string" ? body.space_id.trim() : "");
  if (!spaceId) {
    return { ok: true, space: null };
  }
  const resolution = await resolveRunSpaceById({ scope, spaceId });
  if (resolution.kind === "unresolved") {
    return { error: "workflows.spaceForbidden", ok: false };
  }
  return { ok: true, space: toolsSpaceFromResolution(resolution) };
}

/**
 * What a parked run continues with besides its Space: where it speaks (the
 * workflow's owner, decided at dispatch), whether its specialist steps may
 * ask on an approval step (the same rule dispatch applied), and its routine's
 * standing grants — without them every write after the first gate re-asked.
 */
async function runFootingOf(
  ctx: { scope: { tenantId: string }; store: WorkflowStore },
  request: WorkflowRunRow
): Promise<{
  approvalGrants: readonly string[];
  approvalPolicy?: GraphApprovalPolicy;
  deskAgentId: string | null;
  routineId: string | null;
}> {
  const graph = request.workflow_id
    ? await ctx.store.getGraph({
        id: request.workflow_id,
        tenantId: ctx.scope.tenantId,
      })
    : null;
  const routine = request.routine_id
    ? await createRoutineStoreFromEnv()?.get({
        id: request.routine_id,
        tenantId: ctx.scope.tenantId,
      })
    : null;
  const approvalPolicy = approvalPolicyForRun({
    surface: graph?.surface ?? null,
    trigger: request.trigger,
  });
  return {
    approvalGrants: routine?.approval_grants ?? [],
    ...(approvalPolicy ? { approvalPolicy } : {}),
    deskAgentId: graph?.owner_agent_id ?? null,
    routineId: request.routine_id ?? null,
  };
}

/**
 * The footing a parked run continues on: the one it was dispatched with, in
 * the Space the answerer resolved. Deliberately no userId — answering,
 * stepping back or stopping never lends the run the actor's identity.
 *
 * `deskAgentId` is not identity, it is where the run SPEAKS — the workflow's
 * owner, decided at dispatch. Dropping it here sent every card a graph
 * rendered after its first gate into the run's own log instead of the desk
 * chat, which is the one place anybody reads.
 */
function runContextFor(
  tenantId: string,
  request: WorkflowRunRow,
  version: WorkflowVersionRow,
  space: SpaceGateContext | null,
  footing: Awaited<ReturnType<typeof runFootingOf>>
) {
  return {
    workflowId: request.workflow_id ?? "",
    workflowVersion: version.version,
    requestId: request.id,
    tenantId,
    threadId: request.thread_id ?? "",
    ...(version.allowed_tools ? { allowedToolIds: version.allowed_tools } : {}),
    ...(request.context_type ? { contextType: request.context_type } : {}),
    ...(request.context_id ? { contextId: request.context_id } : {}),
    ...(footing.deskAgentId ? { deskAgentId: footing.deskAgentId } : {}),
    ...(footing.routineId ? { routineId: footing.routineId } : {}),
    ...(footing.approvalGrants.length > 0
      ? { approvalGrants: footing.approvalGrants }
      : {}),
    ...(footing.approvalPolicy
      ? { approvalPolicy: footing.approvalPolicy }
      : {}),
    space,
  };
}

/** A JSON object field, or undefined when it is absent or the wrong shape. */
function objectField(
  source: Record<string, unknown>,
  key: string
): Record<string, unknown> | undefined {
  const value = source[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Read a stored definition off a request body — every field Mastra's
 * `DynamicWorkflowGraph` defines, not just the ones this file reads. A
 * whitelist narrower than the format silently rewrites the definition on every
 * save, and `metadata` is specified as preserved through storage.
 */
function readGraphBody(body: unknown): GraphWorkflowDefinition | null {
  const raw = (body as { graph?: unknown })?.graph;
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const stored = raw as Record<string, unknown>;
  if (!Array.isArray(stored.graph)) {
    return null;
  }
  const description =
    typeof stored.description === "string" ? stored.description : undefined;
  const inputSchema = objectField(stored, "inputSchema");
  const metadata = objectField(stored, "metadata");
  const outputSchema = objectField(stored, "outputSchema");
  const requestContextSchema = objectField(stored, "requestContextSchema");
  const stateSchema = objectField(stored, "stateSchema");
  return {
    graph: stored.graph,
    id: typeof stored.id === "string" ? stored.id : "flow-graph",
    ...(description === undefined ? {} : { description }),
    ...(inputSchema ? { inputSchema } : {}),
    ...(metadata ? { metadata } : {}),
    ...(outputSchema ? { outputSchema } : {}),
    ...(requestContextSchema ? { requestContextSchema } : {}),
    ...(stateSchema ? { stateSchema } : {}),
  };
}

export function registerWorkflowRoutes(
  app: Hono<any>,
  options: RegisterWorkflowRoutesOptions
) {
  const { scopeResolver, getWorkflowStore, getWorkflowRunStore } = options;
  const base = `${AI_BASE_PATH}/v1/workflows`;

  /** Resolve scope + store together — every route needs both. */
  async function ready(c: any) {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return { ok: false as const, response: resolved.response };
    }
    const store = getWorkflowStore();
    if (!store) {
      return {
        ok: false as const,
        response: c.json({ error: "workflows.storeUnavailable" }, 503),
      };
    }
    return { ok: true as const, scope: resolved.scope, store };
  }

  /**
   * A row reconciled from a module's shipped file is READ-ONLY here.
   *
   * Not a permission check — an ownership one. The file is the definition and
   * every reconcile heartbeat republishes it, so a version minted through the
   * UI would be overwritten by the next tick. Letting the write land and then
   * silently losing it is worse than refusing: the author would have no way to
   * tell the difference between "saved" and "gone". Copying it into the
   * library (`publish-to-library`) is the way to get an editable one, and that
   * route stays open.
   */
  async function assertAuthored(
    c: any,
    ctx: { scope: { tenantId: string }; store: WorkflowStore },
    id: string
  ): Promise<{ ok: false; response: Response } | { ok: true }> {
    const row = await ctx.store.getGraph({ id, tenantId: ctx.scope.tenantId });
    if (!row) {
      return {
        ok: false,
        response: c.json({ error: "workflows.notFound" }, 404),
      };
    }
    if (row.source_workflow_id) {
      return {
        ok: false,
        response: c.json(
          {
            error: "workflows.bundledReadOnly",
            source_workflow_id: row.source_workflow_id,
          },
          409
        ),
      };
    }
    return { ok: true };
  }

  app.post(`${base}/validate`, async (c) => {
    const ctx = await ready(c);
    if (!ctx.ok) {
      return ctx.response;
    }
    try {
      const body = await c.req.json().catch(() => ({}));
      const def = readGraphBody(body);
      if (!def) {
        return c.json({ error: "workflows.graphRequired" }, 400);
      }
      const issues = validateGraphAction(
        def,
        validationOptionsFor(ctx.scope, surfaceField(body).surface)
      );
      return c.json({ issues, valid: issues.length === 0 });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to validate action graph",
        "workflows.internalError",
        err
      );
    }
  });

  app.post(base, async (c) => {
    const ctx = await ready(c);
    if (!ctx.ok) {
      return ctx.response;
    }
    try {
      const body = (await c.req.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) {
        return c.json({ error: "workflows.nameRequired" }, 400);
      }
      const graph = await ctx.store.create({
        contextType:
          typeof body.context_type === "string" ? body.context_type : null,
        createdByUserId: ctx.scope.userId,
        description:
          typeof body.description === "string" ? body.description : null,
        moduleId: typeof body.module_id === "string" ? body.module_id : null,
        name,
        ...surfaceField(body),
        tenantId: ctx.scope.tenantId,
      });
      return c.json({ graph }, 201);
    } catch (err) {
      return handleRouteError(
        c,
        "failed to create action graph",
        "workflows.internalError",
        err
      );
    }
  });

  // Create + author in one call: the create dialog's "describe it and we'll
  // draw it". Governance is unchanged from the chat path — the version lands
  // unapproved, and publishing stays a separate human route.
  app.post(`${base}/draft`, async (c) => {
    const ctx = await ready(c);
    if (!ctx.ok) {
      return ctx.response;
    }
    try {
      const body = (await c.req.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const description =
        typeof body.description === "string" ? body.description.trim() : "";
      if (!name) {
        return c.json({ error: "workflows.nameRequired" }, 400);
      }
      if (!description) {
        return c.json({ error: "workflows.descriptionRequired" }, 400);
      }
      const contextType =
        typeof body.context_type === "string" && body.context_type.trim()
          ? body.context_type.trim()
          : null;
      // Optional client-minted observe id — the response takes minutes, so the
      // id has to travel in the request for the client to attach the run
      // stream while drafting is still happening.
      let runId: string | undefined;
      if (body.run_id !== undefined) {
        const parsedRunId = uuidString.safeParse(body.run_id);
        if (!parsedRunId.success) {
          return c.json({ error: "workflows.invalidRunId" }, 400);
        }
        runId = parsedRunId.data;
      }

      const surface = surfaceField(body).surface;
      const drafted = await draftGraphFromDescription({
        description,
        name,
        scope: ctx.scope,
        validation: {
          ...validationOptionsFor(ctx.scope),
          ...(surface ? { surface } : {}),
        },
        ...(contextType ? { contextType } : {}),
        ...(runId ? { runId } : {}),
        ...(surface ? { surface } : {}),
      });

      // The definition is created only once a graph exists to put in it, so a
      // model that returns nothing usable doesn't leave an empty shell behind.
      let graph: Awaited<ReturnType<typeof ctx.store.create>>;
      try {
        graph = await ctx.store.create({
          contextType,
          createdByUserId: ctx.scope.userId,
          description,
          name,
          ...(surface ? { surface } : {}),
          tenantId: ctx.scope.tenantId,
        });
      } catch (err) {
        // Names are unique per tenant. That's a user-correctable clash, not a
        // server fault, and it must not read as one — the drafting work is
        // already done by this point and the only thing wrong is the name.
        if (isDuplicateNameError(err)) {
          return c.json({ error: "workflows.nameTaken" }, 409);
        }
        throw err;
      }
      const version = await ctx.store.saveVersion({
        workflowId: graph.id,
        authoredBy: "copilot",
        graph: { ...drafted.graph, id: `workflow:${graph.id}` },
        inputSchema: drafted.graph.inputSchema,
        outputSchema: drafted.graph.outputSchema,
        tenantId: ctx.scope.tenantId,
        ...(ctx.scope.userId ? { createdByUserId: ctx.scope.userId } : {}),
      });

      // 201 even with issues: a flow with problems marked on its nodes is a
      // place to work from, and the canvas is where they get fixed.
      return c.json(
        {
          graph,
          issues: drafted.issues,
          version,
          ...(drafted.draftedWithFallbackTier
            ? { drafted_with_fallback_tier: true }
            : {}),
        },
        201
      );
    } catch (err) {
      // A cancel is the user's doing, not a failure — answer it distinctly so
      // the log stays clean and the client (already settled on "stopped" from
      // the run stream) can quietly ignore the response.
      if (err instanceof Error && err.message === DRAFT_CANCELLED) {
        return c.json({ error: "workflows.draftCancelled" }, 409);
      }
      // Drafting fails in ways the generic handler renders as an empty `err`
      // (the model returned prose, the agent run errored) — and an unreadable
      // log is the difference between a five-minute fix and an afternoon.
      logger.error("failed to draft action graph", {
        reason: err instanceof Error ? err.stack : String(err),
      });
      return handleRouteError(
        c,
        "failed to draft action graph",
        "workflows.draftFailed",
        err
      );
    }
  });

  // Fix a stored version's validation issues with one AI repair round — the
  // standalone face of the repair the drafter runs internally, behind the
  // canvas's "N to fix" badge. Saves the repaired graph as the NEXT draft
  // version via the store directly: the /versions route rejects any remaining
  // issue, which would throw away a partial repair (6 → 2) — and partial
  // progress on a broken draft is exactly what this endpoint is for.
  app.post(`${base}/:id/repair`, async (c) => {
    const ctx = await ready(c);
    if (!ctx.ok) {
      return ctx.response;
    }
    const authored = await assertAuthored(c, ctx, c.req.param("id"));
    if (!authored.ok) {
      return authored.response;
    }
    const id = c.req.param("id");
    try {
      const body = (await c.req.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const versionId =
        typeof body.version_id === "string" ? body.version_id.trim() : "";
      if (!versionId) {
        return c.json({ error: "workflows.versionRequired" }, 400);
      }
      let runId: string | undefined;
      if (body.run_id !== undefined) {
        const parsedRunId = uuidString.safeParse(body.run_id);
        if (!parsedRunId.success) {
          return c.json({ error: "workflows.invalidRunId" }, 400);
        }
        runId = parsedRunId.data;
      }
      const instruction =
        typeof body.instruction === "string" && body.instruction.trim()
          ? body.instruction.trim()
          : undefined;

      const graph = await ctx.store.getGraph({
        id,
        tenantId: ctx.scope.tenantId,
      });
      if (!graph) {
        return c.json({ error: "workflows.notFound" }, 404);
      }
      const version = await ctx.store.getVersion({
        id: versionId,
        tenantId: ctx.scope.tenantId,
      });
      if (!version || version.workflow_id !== id) {
        return c.json({ error: "workflows.versionNotFound" }, 404);
      }

      const def = readGraphBody({ graph: version.graph });
      if (!def) {
        return c.json({ error: "workflows.invalidGraph" }, 400);
      }
      const storedGraph = {
        ...def,
        id: `workflow:${id}`,
        inputSchema: def.inputSchema ?? { properties: {}, type: "object" },
        outputSchema: def.outputSchema ?? { properties: {}, type: "object" },
      };
      // The issue list is computed HERE, not taken from the request: the
      // client's copy may be stale, and the repair brief must describe the
      // graph actually stored.
      const repairedRow = await ctx.store.getGraph({
        id,
        tenantId: ctx.scope.tenantId,
      });
      const issues = validateGraphAction(
        storedGraph,
        validationOptionsFor(ctx.scope, repairedRow?.surface)
      );
      // Zero issues + an instruction = an EDIT round: describing the change
      // is how a valid flow is edited (there is no manual node editor).
      // Zero issues and no instruction really is nothing to do.
      if (issues.length === 0 && !instruction) {
        return c.json({ error: "workflows.nothingToFix" }, 400);
      }

      const repaired = await repairGraphIssues({
        description: graph.description ?? null,
        graph: storedGraph,
        issues,
        name: graph.name,
        scope: ctx.scope,
        validation: validationOptionsFor(ctx.scope),
        ...(graph.context_type ? { contextType: graph.context_type } : {}),
        ...(instruction ? { instruction } : {}),
        ...(runId ? { runId } : {}),
      });

      if (!repaired.improved) {
        // Nothing got better — say so instead of minting a version identical
        // to the one being repaired.
        return c.json({ improved: false, issues: repaired.issues });
      }

      const saved = await ctx.store.saveVersion({
        workflowId: id,
        authoredBy: "copilot",
        graph: { ...repaired.graph, id: `workflow:${id}` },
        inputSchema: repaired.graph.inputSchema,
        outputSchema: repaired.graph.outputSchema,
        tenantId: ctx.scope.tenantId,
        ...(ctx.scope.userId ? { createdByUserId: ctx.scope.userId } : {}),
      });
      return c.json(
        { improved: true, issues: repaired.issues, version: saved },
        201
      );
    } catch (err) {
      if (err instanceof Error && err.message === DRAFT_CANCELLED) {
        return c.json({ error: "workflows.draftCancelled" }, 409);
      }
      logger.error("failed to repair action graph", {
        reason: err instanceof Error ? err.stack : String(err),
      });
      return handleRouteError(
        c,
        "failed to repair action graph",
        "workflows.repairFailed",
        err
      );
    }
  });

  app.get(base, async (c) => {
    const ctx = await ready(c);
    if (!ctx.ok) {
      return ctx.response;
    }
    try {
      const surface = c.req.query("surface");
      const graphs = await ctx.store.list({
        contextType: c.req.query("context_type") || null,
        ...(surface === "wizard" || surface === "chat" ? { surface } : {}),
        tenantId: ctx.scope.tenantId,
      });
      return c.json({ graphs });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to list action graphs",
        "workflows.internalError",
        err
      );
    }
  });

  app.get(`${base}/:id`, async (c) => {
    const ctx = await ready(c);
    if (!ctx.ok) {
      return ctx.response;
    }
    const id = c.req.param("id");
    try {
      const graph = await ctx.store.getGraph({
        id,
        tenantId: ctx.scope.tenantId,
      });
      if (!graph) {
        return c.json({ error: "workflows.notFound" }, 404);
      }
      const versions = await ctx.store.listVersions({
        workflowId: id,
        tenantId: ctx.scope.tenantId,
      });
      return c.json({ graph, versions });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to read action graph",
        "workflows.internalError",
        err
      );
    }
  });

  app.patch(`${base}/:id`, async (c) => {
    const ctx = await ready(c);
    if (!ctx.ok) {
      return ctx.response;
    }
    const authored = await assertAuthored(c, ctx, c.req.param("id"));
    if (!authored.ok) {
      return authored.response;
    }
    try {
      const body = (await c.req.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const graph = await ctx.store.update({
        id: c.req.param("id"),
        tenantId: ctx.scope.tenantId,
        ...(typeof body.name === "string" ? { name: body.name.trim() } : {}),
        ...(body.description === undefined
          ? {}
          : { description: (body.description as string) ?? null }),
        ...(body.context_type === undefined
          ? {}
          : { contextType: (body.context_type as string) ?? null }),
        ...surfaceField(body),
      });
      return c.json({ graph });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to update action graph",
        "workflows.internalError",
        err
      );
    }
  });

  app.delete(`${base}/:id`, async (c) => {
    const ctx = await ready(c);
    if (!ctx.ok) {
      return ctx.response;
    }
    const authored = await assertAuthored(c, ctx, c.req.param("id"));
    if (!authored.ok) {
      return authored.response;
    }
    try {
      await ctx.store.remove({
        id: c.req.param("id"),
        tenantId: ctx.scope.tenantId,
      });
      return c.json({ ok: true });
    } catch (err) {
      // ON DELETE RESTRICT on the run pin surfaces here — a graph with live or
      // sleeping runs cannot be deleted out from under them.
      return c.json(
        {
          error: "workflows.inUse",
          message: err instanceof Error ? err.message : String(err),
        },
        409
      );
    }
  });

  // Mint an immutable version. Validation runs against the CALLER's
  // capabilities: a graph may only call what its author could call.
  app.post(`${base}/:id/versions`, async (c) => {
    const ctx = await ready(c);
    if (!ctx.ok) {
      return ctx.response;
    }
    const authored = await assertAuthored(c, ctx, c.req.param("id"));
    if (!authored.ok) {
      return authored.response;
    }
    const id = c.req.param("id");
    try {
      const body = (await c.req.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const raw = readGraphBody(body);
      if (!raw) {
        return c.json({ error: "workflows.graphRequired" }, 400);
      }
      // The ONE boundary translation: native Mastra `agent` entries are legal
      // input and are rewritten to `mapping + run_specialist` before the
      // graph is validated or stored — a stored graph never carries one.
      const def = {
        ...raw,
        graph: translateAgentEntries(raw.graph as Record<string, unknown>[]),
      };
      const owner = await ctx.store.getGraph({
        id,
        tenantId: ctx.scope.tenantId,
      });
      if (!owner) {
        return c.json({ error: "workflows.notFound" }, 404);
      }
      const issues = validateGraphAction(
        def,
        validationOptionsFor(ctx.scope, owner.surface)
      );
      if (issues.length > 0) {
        return c.json({ error: "workflows.invalidGraph", issues }, 400);
      }
      // Title + description generated once at save when the row lacks them.
      if (!owner.title) {
        const generated = await generateWorkflowTitle({
          definition: def as unknown as Record<string, unknown>,
          id: owner.name,
        });
        await ctx.store.update({
          id: owner.id,
          tenantId: ctx.scope.tenantId,
          title: generated.title,
          ...(owner.description || !generated.description
            ? {}
            : { description: generated.description }),
        });
      }
      const version = await ctx.store.saveVersion({
        workflowId: id,
        allowedTools: Array.isArray(body.allowed_tools)
          ? (body.allowed_tools as string[])
          : null,
        authoredBy: body.authored_by === "copilot" ? "copilot" : "user",
        createdByUserId: ctx.scope.userId,
        graph: { ...def, id: `workflow:${id}` },
        tenantId: ctx.scope.tenantId,
        ...(def.inputSchema ? { inputSchema: def.inputSchema } : {}),
        ...(def.outputSchema ? { outputSchema: def.outputSchema } : {}),
      });
      return c.json({ version }, 201);
    } catch (err) {
      return handleRouteError(
        c,
        "failed to save action graph version",
        "workflows.internalError",
        err
      );
    }
  });

  /**
   * Publish a workflow to the LIBRARY (decision B): a COPY, never a link.
   * The copy is a new library-owned definition (owner_agent_id null) whose
   * first version is the source's current version with provenance stamped in
   * the definition's metadata; later edits to either side never couple.
   */
  app.post(`${base}/:id/publish-to-library`, async (c) => {
    const ctx = await ready(c);
    if (!ctx.ok) {
      return ctx.response;
    }
    try {
      const source = await ctx.store.getGraph({
        id: c.req.param("id"),
        tenantId: ctx.scope.tenantId,
      });
      if (!source) {
        return c.json({ error: "workflows.notFound" }, 404);
      }
      const current = await ctx.store.getCurrent({
        id: source.id,
        tenantId: ctx.scope.tenantId,
      });
      if (!current) {
        return c.json({ error: "workflows.noPublishedVersion" }, 409);
      }
      const sourceGraph = current.version.graph;
      const copied = {
        ...sourceGraph,
        metadata: {
          ...((sourceGraph.metadata as Record<string, unknown> | undefined) ??
            {}),
          published_from: {
            workflow_id: source.id,
            version: current.version.version,
          },
        },
      };
      const graph = await ctx.store.create({
        contextType: source.context_type,
        createdByUserId: ctx.scope.userId,
        description: source.description,
        name: source.name,
        tenantId: ctx.scope.tenantId,
        title: source.title ?? source.name,
      });
      const version = await ctx.store.saveVersion({
        allowedTools: current.version.allowed_tools,
        authoredBy: "user",
        createdByUserId: ctx.scope.userId,
        workflowId: graph.id,
        graph: copied,
        inputSchema: current.version.input_schema,
        outputSchema: current.version.output_schema,
        tenantId: ctx.scope.tenantId,
      });
      // Publishing to the library IS the approval act.
      const published = await ctx.store.publishVersion({
        approvedByUserId: ctx.scope.userId,
        tenantId: ctx.scope.tenantId,
        versionId: version.id,
      });
      return c.json(published, 201);
    } catch (err) {
      if (isDuplicateNameError(err)) {
        return c.json({ error: "workflows.duplicateName" }, 409);
      }
      return handleRouteError(
        c,
        "failed to publish to the library",
        "workflows.internalError",
        err
      );
    }
  });

  // Approve a version and make it the one dispatch runs. This is the human gate
  // on tenant-authored automation — a saved version is inert until it passes.
  app.post(`${base}/:id/publish`, async (c) => {
    const ctx = await ready(c);
    if (!ctx.ok) {
      return ctx.response;
    }
    const authored = await assertAuthored(c, ctx, c.req.param("id"));
    if (!authored.ok) {
      return authored.response;
    }
    try {
      const body = (await c.req.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const versionId =
        typeof body.version_id === "string" ? body.version_id.trim() : "";
      if (!versionId) {
        return c.json({ error: "workflows.versionRequired" }, 400);
      }
      const version = await ctx.store.getVersion({
        id: versionId,
        tenantId: ctx.scope.tenantId,
      });
      if (!version || version.workflow_id !== c.req.param("id")) {
        return c.json({ error: "workflows.versionNotFound" }, 404);
      }
      // Re-validate at publish: the registry (and the approver's capabilities)
      // may have moved since the version was authored.
      const publishedRow = await ctx.store.getGraph({
        id: c.req.param("id"),
        tenantId: ctx.scope.tenantId,
      });
      const issues = validateGraphAction(
        version.graph as never,
        validationOptionsFor(ctx.scope, publishedRow?.surface)
      );
      if (issues.length > 0) {
        return c.json({ error: "workflows.invalidGraph", issues }, 400);
      }
      const published = await ctx.store.publishVersion({
        approvedByUserId: ctx.scope.userId,
        tenantId: ctx.scope.tenantId,
        versionId,
      });
      // Everything runnable is a routine: publishing a workflow that has no
      // routine yet creates its wrapper (with the standard manual + agent
      // triggers), so the fire doors exist the moment it is runnable.
      await wrapPublishedWorkflow({
        graphId: c.req.param("id"),
        tenantId: ctx.scope.tenantId,
        userId: ctx.scope.userId,
      }).catch((err: unknown) => {
        logger.warn("publish wrap failed — workflow has no routine yet", {
          graphId: c.req.param("id"),
          message: err instanceof Error ? err.message : String(err),
        });
      });
      return c.json(published);
    } catch (err) {
      return handleRouteError(
        c,
        "failed to publish action graph",
        "workflows.internalError",
        err
      );
    }
  });

  app.post(`${base}/:id/run`, async (c) => {
    const ctx = await ready(c);
    if (!ctx.ok) {
      return ctx.response;
    }
    const id = c.req.param("id");
    try {
      const body = (await c.req.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const current = await ctx.store.getCurrent({
        id,
        tenantId: ctx.scope.tenantId,
      });
      if (!current) {
        return c.json({ error: "workflows.noPublishedVersion" }, 409);
      }
      if (current.graph.status !== "active") {
        return c.json({ error: "workflows.notActive" }, 409);
      }

      const contextRaw = (
        body as { context?: { id?: unknown; type?: unknown } }
      ).context;
      const contextType =
        typeof contextRaw?.type === "string" ? contextRaw.type.trim() : "";
      const contextId =
        typeof contextRaw?.id === "string" ? contextRaw.id.trim() : "";

      // The Space the presser was in. Without it the run's thread is
      // space-less, and everything the run resolves FROM that thread later —
      // the desk it speaks into, its memory — has no Space either.
      const claimed = await pressedRunSpace(
        ctx.scope,
        body,
        c.req.header("x-engenty-space-id")
      );
      if (!claimed.ok) {
        return c.json({ error: claimed.error }, 403);
      }

      // Shared with the WorkflowButton press and invoke_workflow's out-of-task
      // path: per-subject dedup, subject bound into the run context, an
      // workflow_run with no owner task, background execution.
      const dispatched = await dispatchPublishedWorkflowRun({
        workflowId: id,
        context: {
          contextId: contextId || null,
          contextType: contextType || null,
        },
        current,
        input: (body.input as Record<string, unknown>) ?? {},
        scope: ctx.scope,
        trigger: body.trigger === "command" ? "command" : "button",
        ...(claimed.space ? { space: claimed.space } : {}),
      });

      return c.json({
        ...(dispatched.deduped ? { deduped: true } : {}),
        run_id: dispatched.runId,
        thread_id: dispatched.threadId,
        request_id: dispatched.requestId,
      });
    } catch (err) {
      if (err instanceof FlowInputMissingError) {
        return c.json(
          {
            error: "workflows.inputMissing",
            message: err.message,
            missing: err.missing,
          },
          400
        );
      }
      if (err instanceof FlowInputShapeError) {
        return c.json(
          {
            error: "workflows.inputInvalid",
            issues: err.issues,
            message: err.message,
          },
          422
        );
      }
      return handleRouteError(
        c,
        "failed to run action graph",
        "workflows.internalError",
        err
      );
    }
  });

  // Runs for an action, newest first — the monitor list.
  app.get(`${base}/:id/runs`, async (c) => {
    const ctx = await ready(c);
    if (!ctx.ok) {
      return ctx.response;
    }
    try {
      const requests = getWorkflowRunStore();
      const runs = requests
        ? await requests.list({
            workflowId: c.req.param("id"),
            tenantId: ctx.scope.tenantId,
          })
        : [];
      return c.json({ runs });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to list action graph runs",
        "workflows.internalError",
        err
      );
    }
  });

  // One run's per-node state — what the monitor canvas overlays on the graph.
  app.get(`${base}/runs/:runId`, async (c) => {
    const ctx = await ready(c);
    if (!ctx.ok) {
      return ctx.response;
    }
    const runId = c.req.param("runId");
    try {
      const requests = getWorkflowRunStore();
      const request = await requests?.getByRunId({
        runId,
        tenantId: ctx.scope.tenantId,
      });
      if (!request?.workflow_version_id) {
        return c.json({ error: "workflows.runNotFound" }, 404);
      }
      const version = await ctx.store.getVersion({
        id: request.workflow_version_id,
        tenantId: ctx.scope.tenantId,
      });
      if (!version) {
        return c.json({ error: "workflows.pinnedVersionMissing" }, 410);
      }
      const snapshot = await readGraphRunSnapshot({ runId, version });
      // The run is always rendered against the version it STARTED on, never
      // the current one — otherwise a run in flight would be drawn as a graph
      // it is not executing.
      return c.json({ request, snapshot, version });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to read action graph run",
        "workflows.internalError",
        err
      );
    }
  });

  // Answer a gate. Resuming re-enters the graph at the suspended node and runs
  // on to the next gate, sleep, or the end.
  app.post(`${base}/runs/:runId/resume`, async (c) => {
    const ctx = await ready(c);
    if (!ctx.ok) {
      return ctx.response;
    }
    const runId = c.req.param("runId");
    try {
      const body = (await c.req.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const requests = getWorkflowRunStore();
      const request = await requests?.getByRunId({
        runId,
        tenantId: ctx.scope.tenantId,
      });
      if (!(request?.workflow_version_id && request.workflow_id)) {
        return c.json({ error: "workflows.runNotFound" }, 404);
      }
      const version = await ctx.store.getVersion({
        id: request.workflow_version_id,
        tenantId: ctx.scope.tenantId,
      });
      if (!version) {
        // The pinned version is gone — the run cannot be resumed onto a
        // different graph, so fail loudly rather than silently substituting.
        return c.json({ error: "workflows.pinnedVersionMissing" }, 410);
      }

      const answerer = await resolveAnswererSpace(ctx.scope, request);
      if (!answerer.ok) {
        return c.json({ error: answerer.error }, 403);
      }

      // The answer joins the question on the task thread (Phase 8 P8-1). Order
      // matters only for readability: decision first, then whatever the resumed
      // run went on to do.
      if (request.owner_task_id) {
        await mirrorFlowDecisionToTask({
          approved: body.approved === true,
          taskId: request.owner_task_id,
          tenantId: ctx.scope.tenantId,
          ...(ctx.scope.userId ? { answeredByUserId: ctx.scope.userId } : {}),
          ...(typeof body.reason === "string" ? { reason: body.reason } : {}),
        });
      }
      const footing = await runFootingOf(ctx, request);
      // An approval step answers for the calls the run parked with — read
      // from the run, never from the request body.
      const snapshot = await readGraphRunSnapshot({ runId, version });
      const pendingCalls =
        snapshot?.gate?.kind === "operation_approval"
          ? (snapshot.gate.pending_calls ?? [])
          : [];
      const approved = body.approved === true;
      const accessToken = scopeAccessToken(ctx.scope);
      const resume = () =>
        resumeGraphRun({
          ctx: runContextFor(
            ctx.scope.tenantId,
            request,
            version,
            answerer.space,
            footing
          ),
          resumeData: {
            approved,
            ...(body.data
              ? { data: body.data as Record<string, unknown> }
              : {}),
            ...(typeof body.event === "string" ? { event: body.event } : {}),
            ...(typeof body.reason === "string" ? { reason: body.reason } : {}),
            ...(pendingCalls.length > 0
              ? approved
                ? { approved_calls: pendingCalls }
                : { declined_calls: pendingCalls }
              : {}),
          },
          runId,
          version,
          ...stepTarget(body),
        });
      continueInBackground({
        // The approver's bearer rides the resume in memory, so the replay can
        // answer core's own request for the calls they allowed.
        continue: () =>
          pendingCalls.length > 0 && approved && accessToken
            ? resumeAnswererAls.run({ accessToken }, resume)
            : resume(),
        initiatorUserId: ctx.scope.userId ?? null,
        request,
        runId,
        space: answerer.space,
        tenantId: ctx.scope.tenantId,
        version,
      });
      return c.json({ ok: true, run_id: runId });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to resume action graph run",
        "workflows.internalError",
        err
      );
    }
  });

  // Step back to an earlier gate: the run re-executes from there, the gate
  // asks again (its previous answer stays in the snapshot for the prefill), and
  // everything after it runs anew once answered. Only a parked run can travel.
  app.post(`${base}/runs/:runId/time-travel`, async (c) => {
    const ctx = await ready(c);
    if (!ctx.ok) {
      return ctx.response;
    }
    const runId = c.req.param("runId");
    try {
      const body = (await c.req.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const target = stepTarget(body).stepId;
      if (!target) {
        return c.json({ error: "workflows.stepRequired" }, 400);
      }
      const located = await locateRun(ctx, getWorkflowRunStore(), runId);
      if (!located.ok) {
        return c.json({ error: located.error }, located.status);
      }
      const { request, version } = located;
      if (request.status !== "requires_action") {
        return c.json({ error: "workflows.runNotParked" }, 409);
      }
      const answerer = await resolveAnswererSpace(ctx.scope, request);
      if (!answerer.ok) {
        return c.json({ error: answerer.error }, 403);
      }
      const footing = await runFootingOf(ctx, request);
      continueInBackground({
        continue: () =>
          timeTravelGraphRun({
            ctx: runContextFor(
              ctx.scope.tenantId,
              request,
              version,
              answerer.space,
              footing
            ),
            runId,
            stepId: target,
            version,
          }),
        initiatorUserId: ctx.scope.userId ?? null,
        request,
        runId,
        space: answerer.space,
        tenantId: ctx.scope.tenantId,
        version,
      });
      return c.json({ ok: true, run_id: runId });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to step back in action graph run",
        "workflows.internalError",
        err
      );
    }
  });

  // Stop a parked run. Artifacts it wrote stay; nothing resumes it.
  app.post(`${base}/runs/:runId/cancel`, async (c) => {
    const ctx = await ready(c);
    if (!ctx.ok) {
      return ctx.response;
    }
    const runId = c.req.param("runId");
    try {
      const located = await locateRun(ctx, getWorkflowRunStore(), runId);
      if (!located.ok) {
        return c.json({ error: located.error }, located.status);
      }
      const { request, version } = located;
      if (
        request.status === "completed" ||
        request.status === "failed" ||
        request.status === "cancelled"
      ) {
        return c.json({ error: "workflows.runSettled" }, 409);
      }
      await cancelGraphRun({ runId, version });
      await settleGraphRun({
        outcome: { reason: "cancelled by the person", status: "cancelled" },
        requestId: request.id,
        runId,
        tenantId: ctx.scope.tenantId,
      });
      return c.json({ ok: true });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to cancel action graph run",
        "workflows.internalError",
        err
      );
    }
  });

  // The owner looked at a held run (routine `report: ask`) — finish it. A run
  // parked at a GATE is not reviewable; its answer goes through `resume`.
  app.post(`${base}/runs/:runId/review`, async (c) => {
    const ctx = await ready(c);
    if (!ctx.ok) {
      return ctx.response;
    }
    const runId = c.req.param("runId");
    try {
      const requests = getWorkflowRunStore();
      const request = await requests?.getByRunId({
        runId,
        tenantId: ctx.scope.tenantId,
      });
      if (!(requests && request?.workflow_version_id)) {
        return c.json({ error: "workflows.runNotFound" }, 404);
      }
      if (request.status !== "requires_action") {
        return c.json({ error: "workflows.runNotHeld" }, 409);
      }
      const threadStore = createThreadStoreFromEnv();
      if (request.thread_id && threadStore) {
        const spaceGate = await resolveRunSpaceForThread({
          scope: ctx.scope,
          store: threadStore,
          threadId: request.thread_id,
        });
        if (spaceGate.kind === "unresolved") {
          return c.json({ error: "workflows.spaceForbidden" }, 403);
        }
      }
      const version = await ctx.store.getVersion({
        id: request.workflow_version_id,
        tenantId: ctx.scope.tenantId,
      });
      if (version) {
        const snapshot = await readGraphRunSnapshot({ runId, version });
        if (snapshot?.gate) {
          return c.json({ error: "workflows.runAwaitingGate" }, 409);
        }
      }
      const routine = request.routine_id
        ? ((await createRoutineStoreFromEnv()
            ?.get({ id: request.routine_id, tenantId: ctx.scope.tenantId })
            .catch(() => null)) ?? null)
        : null;
      const result = await releaseReviewedRun({
        request,
        requests,
        routine,
        runId,
        tenantId: ctx.scope.tenantId,
      });
      return c.json({ ok: true, result });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to release reviewed run",
        "workflows.internalError",
        err
      );
    }
  });
}
