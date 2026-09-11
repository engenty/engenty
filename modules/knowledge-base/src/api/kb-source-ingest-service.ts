/**
 * Shared KB source ingestion service.
 *
 * One implementation behind BOTH edges that can trigger ingestion:
 * - the HTTP route `POST /api/kb/sources/:id/ingest` (kb-sources.ts)
 * - the agent gateway operation `kb_source_ingest` (ai/tools/kb-ai-gateway-sources.ts)
 *
 * Keeping the task-dispatch + ingest_config bookkeeping here means the two
 * edges cannot drift: an agentic run always becomes an observable task, and a
 * sync run always persists the template/category choices it was called with.
 */
import {
  createPluginServerGatewayCaller,
  type PluginAuthContext,
  type PluginServerApi,
} from "@engenty/plugin-sdk";
import type { z } from "zod";
import type { KbRepoFactory } from "../dal/contracts.js";
import {
  type kbSourceIngestBodySchema,
  kbSourceIngestConfigSchema,
} from "../schema/sources.js";
import {
  type IngestKbSourceResult,
  ingestKbSource,
} from "../sources/source-ingestor.js";
import { buildIngestTaskBrief } from "./kb-source-ingest-task-brief.js";

// Ingest tasks are assigned to the manager (workforce plan R1 —
// research-assistant removed).
export const KB_INGEST_AGENT_TYPE_KEY = "knowledge-base.manager";

export type KbSourceIngestBody = z.infer<typeof kbSourceIngestBodySchema>;

/** The part of the server api needed for cross-module task dispatch. */
export type KbIngestGatewayApi = Pick<
  PluginServerApi,
  "callGatewayMethod" | "hasOperation"
>;

export type KbSourceIngestOutcome =
  | { status: "not_found" }
  | { status: "failed"; message: string }
  | {
      status: "ok";
      result: IngestKbSourceResult & { async_run?: boolean; task_id?: string };
    };

export async function runKbSourceIngestRequest(args: {
  auth: PluginAuthContext | undefined;
  body: KbSourceIngestBody;
  /** Null when the caller cannot dispatch cross-module operations. */
  gateway: KbIngestGatewayApi | null;
  repos: KbRepoFactory;
  sourceId: string;
}): Promise<KbSourceIngestOutcome> {
  const { auth, body, repos, sourceId } = args;
  const source = await repos.sources.getById(sourceId);
  if (!source) {
    return { status: "not_found" };
  }
  const gw = args.gateway
    ? createPluginServerGatewayCaller(args.gateway)
    : null;
  const isAgentic = body.strategy === "agentic";

  // Create a task for agentic runs so the run is observable in the Tasks UI
  // and sets up the pattern for future Conductor dispatch. The task is created
  // by the acting user and assigned to the KB manager agent. Status is left at
  // the tenant default; the run outcome is reported as a comment (statuses are
  // tenant-configurable).
  let taskId: string | undefined;
  if (isAgentic && gw?.hasOperation("tasks_create")) {
    try {
      const kb = await repos.kb.getById(source.kb_id).catch(() => null);
      const instructions =
        body.instructions ||
        source.ingest_config.agentic_instructions ||
        "(no specific instructions provided — create one draft article per source item)";
      const categoryId =
        body.category_id ?? source.ingest_config.category_id ?? null;
      const parentArticleId =
        body.parent_article_id ??
        source.ingest_config.parent_article_id ??
        null;
      const description = buildIngestTaskBrief({
        sourceName: source.name,
        sourceId,
        kbName: kb?.name ?? null,
        kbId: source.kb_id,
        kbSlug: kb?.slug ?? null,
        categoryId,
        parentArticleId,
        instructions,
      });
      const contexts: Array<{
        context_type: string;
        context_id: string;
      }> = [
        { context_type: "kb_source", context_id: sourceId },
        { context_type: "knowledge_base", context_id: source.kb_id },
      ];
      const task = (await gw.invokeOperation(
        "tasks_create",
        {
          title: `KB Ingest: ${source.name}`,
          description,
          primary_assignee_kind: "agent",
          primary_assignee_agent_type_key: KB_INGEST_AGENT_TYPE_KEY,
          contexts,
        },
        { auth }
      )) as { id: string } | null;
      taskId = task?.id;
    } catch {
      // Non-fatal: tasks module may not be enabled
    }
  }

  const reportTaskOutcome = async (content: string) => {
    if (!(taskId && gw?.hasOperation("tasks_add_comment"))) {
      return;
    }
    try {
      await gw.invokeOperation(
        "tasks_add_comment",
        // `result` is the ingest task's OUTCOME — what a dependent task
        // inherits and what the panel renders as the run's answer. Unkinded
        // it defaulted to `note` and read as somebody's remark.
        { id: taskId, content, kind: "result" },
        { auth }
      );
    } catch {
      // Non-fatal
    }
  };

  const ingestOpts = {
    actorPrincipalId: auth?.principalId ?? null,
    attach_original: body.attach_original,
    category_id: body.category_id,
    include_full_content: body.include_full_content,
    include_questions: body.include_questions,
    include_summary: body.include_summary,
    instructions: body.instructions,
    item_ids: body.item_ids,
    parent_article_id: body.parent_article_id,
    split_long_articles: body.split_long_articles,
    strategy: body.strategy,
    template_id: body.template_id,
    template_mode: body.template_mode,
  };

  // Agentic runs with a task: the task is auto-dispatched to the KB manager
  // agent via the task dispatcher. Return immediately — the agent reports its
  // outcome as a task comment.
  if (isAgentic && taskId) {
    return {
      status: "ok",
      result: {
        article_ids: [],
        ingested_items: 0,
        strategy: body.strategy,
        task_id: taskId,
        async_run: true,
      },
    };
  }

  try {
    const result = await ingestKbSource(repos, sourceId, ingestOpts);
    await reportTaskOutcome(
      `✅ Ingestion complete — ${result.ingested_items} article(s) created or updated.`
    );
    // Remember what this run was configured with, so the next run — manual,
    // scheduled or agent-driven — starts from the same choices.
    const configKeys = [
      "attach_original",
      "category_id",
      "include_full_content",
      "include_questions",
      "include_summary",
      "split_long_articles",
      "template_id",
      "template_mode",
    ] as const;
    if (configKeys.some((key) => body[key] !== undefined)) {
      const patch: Record<string, unknown> = {};
      for (const key of configKeys) {
        if (body[key] !== undefined) {
          patch[key] = body[key];
        }
      }
      await repos.sources.update(sourceId, {
        ingest_config: kbSourceIngestConfigSchema.parse({
          ...source.ingest_config,
          ...patch,
          template_mode:
            body.template_mode ??
            source.ingest_config.template_mode ??
            "inherit",
        }),
      });
    }
    return { status: "ok", result: { ...result, task_id: taskId } };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to ingest source";
    await reportTaskOutcome(`❌ Ingestion failed — ${message}`);
    if (message === "Source not found") {
      return { status: "not_found" };
    }
    return { status: "failed", message };
  }
}

/**
 * Run every ingestion mode the source has armed, after a successful sync.
 *
 * Arming is per mode and the modes are not alternatives: authored ingestion
 * writes articles straight from the fetched text, agentic ingestion dispatches
 * an agent to author a wiki from the same items. A source may have both, and
 * a sync that fetched new material should refresh both.
 *
 * Failures are swallowed deliberately — a sync that fetched its items
 * succeeded, and reporting it as failed because a downstream ingest could not
 * reach the model would hide the part that worked. Each mode reports its own
 * outcome through the returned list.
 */
export async function runArmedKbSourceIngestions(args: {
  auth: PluginAuthContext | undefined;
  gateway: KbIngestGatewayApi | null;
  repos: KbRepoFactory;
  sourceId: string;
}): Promise<KbSourceIngestOutcome[]> {
  const source = await args.repos.sources.getById(args.sourceId);
  if (!source) {
    return [];
  }
  const config = source.ingest_config;
  const armed: KbSourceIngestBody["strategy"][] = [];
  if (config.authored_active) {
    // `per_source` is the merged shape; the per-entry default matches what the
    // panel starts on and what a crawl usually wants.
    armed.push("per_entry");
  }
  if (config.agentic_active) {
    armed.push("agentic");
  }
  if (armed.length === 0) {
    return [];
  }

  const outcomes: KbSourceIngestOutcome[] = [];
  for (const strategy of armed) {
    try {
      outcomes.push(
        await runKbSourceIngestRequest({
          auth: args.auth,
          // Send strategy only: every other field is left undefined so the
          // source's own ingest_config supplies it, which is the whole point
          // of arming a mode rather than replaying one request's options.
          body: { strategy },
          gateway: args.gateway,
          repos: args.repos,
          sourceId: args.sourceId,
        })
      );
    } catch (error) {
      outcomes.push({
        message:
          error instanceof Error ? error.message : "Failed to ingest source",
        status: "failed",
      });
    }
  }
  return outcomes;
}
