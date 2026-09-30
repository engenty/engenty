// `company_memory_add` / `company_memory_remove` — the only writers of the
// company scope of `ai.memory_entries`: the facts every Space's agents are
// shown on every turn.
//
// Same gate as the company drive (company-files-methods.ts): a person holding
// `core.company_memory.manage` writes directly; an agent's call parks on an
// approval only such a person can decide (`approverCapability`, enforced by
// policy and by the decision route). A headless agent run arrives as a
// service principal naming its agent — policy never lets that through
// without the approval either, so it is let in here like an agent principal.
import {
  COMPANY_MEMORY_ADD_OPERATION_ID,
  COMPANY_MEMORY_REMOVE_OPERATION_ID,
  MEMORY_BODY_MAX_CHARS,
  MEMORY_SHORT_ID_LENGTH,
  memorySectionFits,
  normalizeMemoryBody,
  shortMemoryId,
} from "@engenty/ai-core";
import {
  actorUserIdFromAuth,
  COMPANY_MEMORY_MANAGE_CAPABILITY,
  capabilityCovers,
  type PluginAuthContext,
  type PluginGatewayMethod,
  PluginOperationError,
} from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { PluginRegistry } from "../../../plugins/registry.js";

const addInputSchema = z.object({
  body: z.string().min(1).max(MEMORY_BODY_MAX_CHARS),
});

const removeInputSchema = z.object({
  id: z.string().trim().min(MEMORY_SHORT_ID_LENGTH).max(36),
});

const OPERATION = {
  approverCapability: COMPANY_MEMORY_MANAGE_CAPABILITY,
  audit: "always",
  moduleId: "core",
  requiresApproval: true,
  riskLevel: "high",
  spacePolicy: { kind: "tenant_shared" },
} as const;

interface CompanyMemoryRow {
  body: string;
  created_at: string;
  id: string;
}

function assertMayWrite(auth: PluginAuthContext | undefined): string {
  if (!auth?.tenantId) {
    throw new PluginOperationError(
      "tenant_required",
      "Tenant context required",
      { status: 400 }
    );
  }
  const agentCall =
    auth.principalType === "agent" ||
    (auth.principalType === "service" && Boolean(auth.agentId));
  if (
    !(
      agentCall ||
      capabilityCovers(
        auth.capabilities ?? [],
        COMPANY_MEMORY_MANAGE_CAPABILITY
      )
    )
  ) {
    throw new PluginOperationError(
      "company_memory_forbidden",
      `Writing company memory needs ${COMPANY_MEMORY_MANAGE_CAPABILITY}.`,
      { status: 403 }
    );
  }
  return auth.tenantId;
}

function companyEntries(registry: PluginRegistry, tenantId: string) {
  const db = registry.getTenantDb?.({ tenantId }) as SupabaseClient | null;
  if (!db) {
    throw new Error("company memory requires the tenant database lane.");
  }
  return db.schema("ai").from("memory_entries");
}

async function listCompanyEntries(
  registry: PluginRegistry,
  tenantId: string
): Promise<CompanyMemoryRow[]> {
  const { data, error } = await companyEntries(registry, tenantId)
    .select("id, body, created_at")
    .eq("tenant_id", tenantId)
    .eq("scope", "company")
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(`memory_entries list: ${error.message}`);
  }
  return (data ?? []) as CompanyMemoryRow[];
}

export function buildCompanyMemoryAddMethod(
  registry: PluginRegistry
): PluginGatewayMethod {
  return {
    description: `Keep one fact in company memory — shown to every agent in every Space. One sentence. Needs approval by someone holding ${COMPANY_MEMORY_MANAGE_CAPABILITY}.`,
    handler: async (input, ctx) => {
      const tenantId = assertMayWrite(ctx.auth);
      const body = normalizeMemoryBody(addInputSchema.parse(input).body);
      const rows = await listCompanyEntries(registry, tenantId);
      const room = memorySectionFits({ body, rows, scope: "company" });
      if (!room.fits) {
        throw new PluginOperationError(
          "company_memory_full",
          `Company memory would be ${room.length} characters; the limit is ${room.limit}. Remove old entries first.`,
          { status: 413 }
        );
      }
      const { data, error } = await companyEntries(registry, tenantId)
        .insert({
          body,
          created_by_user_id: actorUserIdFromAuth(ctx.auth),
          scope: "company",
          tenant_id: tenantId,
        })
        .select("id")
        .single();
      if (error) {
        throw new Error(`memory_entries insert: ${error.message}`);
      }
      return { id: shortMemoryId((data as { id: string }).id), kept: true };
    },
    inputSchema: addInputSchema,
    name: COMPANY_MEMORY_ADD_OPERATION_ID,
    operation: { ...OPERATION, operationId: COMPANY_MEMORY_ADD_OPERATION_ID },
    summary: "Keep a fact in company memory",
  };
}

export function buildCompanyMemoryRemoveMethod(
  registry: PluginRegistry
): PluginGatewayMethod {
  return {
    description: `Remove one company memory entry by the id in its brackets (or its full id). Needs approval by someone holding ${COMPANY_MEMORY_MANAGE_CAPABILITY}.`,
    handler: async (input, ctx) => {
      const tenantId = assertMayWrite(ctx.auth);
      const wanted = shortMemoryId(removeInputSchema.parse(input).id);
      const row = (await listCompanyEntries(registry, tenantId)).find(
        (candidate) => shortMemoryId(candidate.id) === wanted
      );
      if (!row) {
        throw new PluginOperationError(
          "company_memory_not_found",
          `No company memory entry ${wanted}.`,
          { status: 404 }
        );
      }
      const { error } = await companyEntries(registry, tenantId)
        .delete()
        .eq("tenant_id", tenantId)
        .eq("scope", "company")
        .eq("id", row.id);
      if (error) {
        throw new Error(`memory_entries delete: ${error.message}`);
      }
      return { id: wanted, removed: true };
    },
    inputSchema: removeInputSchema,
    name: COMPANY_MEMORY_REMOVE_OPERATION_ID,
    operation: {
      ...OPERATION,
      operationId: COMPANY_MEMORY_REMOVE_OPERATION_ID,
    },
    summary: "Remove a fact from company memory",
  };
}
