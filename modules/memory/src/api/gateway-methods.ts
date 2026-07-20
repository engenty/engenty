import type {
  PluginAuthContext,
  PluginServerApi,
} from "@engenty/plugin-sdk";
import { z } from "zod";
import type { MemoryRepo } from "../dal/contracts.js";
import {
  memoryRecordArchiveInputSchema,
  memoryRecordListInputSchema,
  memoryRecordSchema,
  memoryRecordUpsertInputSchema,
} from "../schema/zod.js";

export type MemoryRepoFactory = (auth: PluginAuthContext) => MemoryRepo;

function requireAuth(ctx: { auth?: PluginAuthContext }): PluginAuthContext {
  if (!ctx.auth) {
    throw new Error("unauthorized");
  }
  return ctx.auth;
}

/** An agent (not the user directly) is driving this call. */
function isAgentPrincipal(auth: PluginAuthContext): boolean {
  return Boolean(auth.agentId);
}

export function registerMemoryGatewayMethods(
  api: PluginServerApi,
  repoFactory: MemoryRepoFactory
): void {
  api.registerOperation({
    operationId: "memory_record_upsert",
    moduleId: "memory",
    summary: "Save or update a durable memory record (upsert by scope + slug)",
    // Deliberately low-risk and approval-free: memory writes are
    // non-destructive (slug upsert, soft-delete only) and must work from
    // headless reflection runs where approvalPolicy is "deny". Org-scope
    // governance happens via the forced 'proposed' status instead.
    riskLevel: "low",
    requiredCapabilities: ["module.memory.write"],
    inputSchema: memoryRecordUpsertInputSchema,
    outputSchema: memoryRecordSchema,
    handler: async (input, ctx) => {
      const auth = requireAuth(ctx);
      const parsed = memoryRecordUpsertInputSchema.parse(input);
      const agentPrincipal = isAgentPrincipal(auth);
      if (parsed.scope_kind !== "org" && !parsed.scope_ref) {
        throw new Error(
          `memory_record_upsert: scope_ref is required for scope_kind '${parsed.scope_kind}'`
        );
      }
      if (parsed.scope_kind === "org" && parsed.scope_ref) {
        throw new Error(
          "memory_record_upsert: org scope takes no scope_ref (it is tenant-wide)"
        );
      }
      // Agents cannot claim 'human' provenance.
      const sourceKind = agentPrincipal
        ? parsed.source_kind === "reflection"
          ? "reflection"
          : "agent"
        : (parsed.source_kind ?? "human");
      const repo = repoFactory(auth);
      return repo.upsert({
        scope_kind: parsed.scope_kind,
        scope_ref: parsed.scope_ref ?? null,
        slug: parsed.slug,
        title: parsed.title,
        body_md: parsed.body_md,
        kind: parsed.kind,
        confidence: parsed.confidence,
        source_kind: sourceKind,
        // Org-wide memories from agents are proposals until a human approves.
        ...(parsed.scope_kind === "org" && agentPrincipal
          ? { status: "proposed" as const }
          : {}),
        agent_type_key: agentPrincipal
          ? (parsed.agent_type_key ?? auth.agentId ?? null)
          : null,
        created_by: auth.principalId,
        ...(parsed.supersedes ? { supersedes: parsed.supersedes } : {}),
      });
    },
  });

  api.registerOperation({
    operationId: "memory_record_list",
    moduleId: "memory",
    summary: "List memory records by scope, kind, and status",
    idempotent: true,
    riskLevel: "low",
    requiredCapabilities: ["module.memory.read"],
    inputSchema: memoryRecordListInputSchema,
    handler: async (input, ctx) => {
      const auth = requireAuth(ctx);
      const parsed = memoryRecordListInputSchema.parse(input) ?? { limit: 50 };
      const repo = repoFactory(auth);
      const rows = await repo.list({
        ...(parsed.scope_kind ? { scope_kind: parsed.scope_kind } : {}),
        ...(parsed.scope_ref !== undefined
          ? { scope_ref: parsed.scope_ref }
          : {}),
        ...(parsed.kind ? { kind: parsed.kind } : {}),
        ...(parsed.status ? { status: parsed.status } : {}),
        limit: parsed.limit,
      });
      return { rows };
    },
  });

  api.registerOperation({
    operationId: "memory_record_archive",
    moduleId: "memory",
    summary: "Archive a memory record (soft delete; drops it from recall)",
    riskLevel: "low",
    requiredCapabilities: ["module.memory.write"],
    inputSchema: memoryRecordArchiveInputSchema,
    outputSchema: memoryRecordSchema,
    handler: async (input, ctx) => {
      const auth = requireAuth(ctx);
      const parsed = memoryRecordArchiveInputSchema.parse(input);
      const repo = repoFactory(auth);
      const record = await repo.getById(parsed.id);
      if (!record) {
        throw new Error(`memory_record_archive: record '${parsed.id}' not found`);
      }
      if (record.status === "archived") {
        return record;
      }
      // Server-side mirror of the agent discipline: agents never archive
      // human-authored records, org-wide records, or pending proposals —
      // those are flagged to a human instead.
      if (isAgentPrincipal(auth)) {
        if (record.source_kind === "human") {
          throw new Error(
            "memory_record_archive: agents cannot archive human-authored records — flag it to a human instead"
          );
        }
        if (record.scope_kind === "org") {
          throw new Error(
            "memory_record_archive: agents cannot archive org-wide records — flag it to a human instead"
          );
        }
        if (record.status === "proposed") {
          throw new Error(
            "memory_record_archive: proposed records await human review and cannot be archived by agents"
          );
        }
      }
      return repo.archive(parsed.id);
    },
  });

  api.registerOperation({
    operationId: "memory_record_approve",
    moduleId: "memory",
    summary: "Approve a proposed org-wide memory record (activates it)",
    riskLevel: "low",
    requiredCapabilities: ["module.memory.approve"],
    inputSchema: z.object({ id: z.string().min(1) }),
    outputSchema: memoryRecordSchema,
    handler: async (input, ctx) => {
      const auth = requireAuth(ctx);
      if (isAgentPrincipal(auth)) {
        throw new Error(
          "memory_record_approve: only a human user can approve proposed memories"
        );
      }
      const parsed = z.object({ id: z.string().min(1) }).parse(input);
      const repo = repoFactory(auth);
      const record = await repo.getById(parsed.id);
      if (!record) {
        throw new Error(`memory_record_approve: record '${parsed.id}' not found`);
      }
      if (record.status !== "proposed") {
        throw new Error(
          `memory_record_approve: record '${parsed.id}' is '${record.status}', not 'proposed'`
        );
      }
      return repo.approve(parsed.id);
    },
  });
}
