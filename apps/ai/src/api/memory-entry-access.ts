// Which memory key a PERSON reaches from the UI, and whether they may change
// it. The run side is memory-scopes.ts; this is the same rows seen from a
// settings page, a Space home or an agent's Manage tab.
//
// - user:    your own facts, always yours to edit
// - space:   a Space you may enter; every member may edit
// - company: everyone reads; writes go to core (`company_memory_add` /
//            `company_memory_remove`), which lets a holder of
//            `core.company_memory.manage` through
// - agent:   a personal agent's notes are per person (yours); any other
//            agent's are per Space (members edit) or, outside a Space, per
//            company (capability holders edit)
import {
  type AiRegistry,
  COMPANY_MEMORY_MANAGE_CAPABILITY,
} from "@engenty/ai-core";
import { z } from "zod";
import { canEnterSpaceDefault } from "../ai/sessions/thread-access.js";
import {
  type AiSessionScope,
  scopeCoversCapability,
} from "../ai/sessions/types.js";
import type { MemoryKey } from "../dal/memory/index.js";
import { uuidString } from "./http.js";

export const memoryEntryQuerySchema = z.object({
  agent_id: z.string().trim().min(1).max(128).optional(),
  scope: z.enum(["agent", "user", "space", "company"]),
  space_id: uuidString.optional(),
});

export type MemoryEntryQuery = z.infer<typeof memoryEntryQuerySchema>;

export type MemoryAccess =
  | { canEdit: boolean; key: MemoryKey; ok: true }
  | { error: string; ok: false; status: 400 | 404 };

export async function resolveMemoryAccess(input: {
  canEnterSpace?: (scope: AiSessionScope, spaceId: string) => Promise<boolean>;
  query: MemoryEntryQuery;
  registry: AiRegistry;
  scope: AiSessionScope;
}): Promise<MemoryAccess> {
  const { query, scope } = input;
  const canEnterSpace = input.canEnterSpace ?? canEnterSpaceDefault;
  const companyEditor = scopeCoversCapability(
    scope,
    COMPANY_MEMORY_MANAGE_CAPABILITY
  );
  const inSpace = async (spaceId: string) =>
    await canEnterSpace(scope, spaceId);

  switch (query.scope) {
    case "user":
      return {
        canEdit: true,
        key: { scope: "user", userId: scope.userId },
        ok: true,
      };
    case "company":
      return { canEdit: companyEditor, key: { scope: "company" }, ok: true };
    case "space": {
      if (!query.space_id) {
        return { error: "memory.spaceRequired", ok: false, status: 400 };
      }
      if (!(await inSpace(query.space_id))) {
        return { error: "memory.notFound", ok: false, status: 404 };
      }
      return {
        canEdit: true,
        key: { scope: "space", spaceId: query.space_id },
        ok: true,
      };
    }
    default: {
      if (!query.agent_id) {
        return { error: "memory.agentRequired", ok: false, status: 400 };
      }
      const config = await input.registry.getAgentConfig(query.agent_id);
      if (!config) {
        return { error: "memory.notFound", ok: false, status: 404 };
      }
      if (config.agentScope === "personal") {
        return {
          canEdit: true,
          key: {
            agentId: query.agent_id,
            scope: "agent",
            spaceId: null,
            userId: scope.userId,
          },
          ok: true,
        };
      }
      if (query.space_id && !(await inSpace(query.space_id))) {
        return { error: "memory.notFound", ok: false, status: 404 };
      }
      return {
        canEdit: query.space_id ? true : companyEditor,
        key: {
          agentId: query.agent_id,
          scope: "agent",
          spaceId: query.space_id ?? null,
          userId: null,
        },
        ok: true,
      };
    }
  }
}
