// Load persisted AGENTS.md / SOUL.md / SKILLS.md overrides + append docs for live agent assembly.

import {
  ENGENTY_COPILOT_AGENTS_KEY,
  ENGENTY_COPILOT_SKILLS_KEY,
  ENGENTY_COPILOT_SOUL_KEY,
} from "@engenty/ai-core";
import { createInstructionOverridesStore } from "../../dal/instructions/instruction-overrides-store.js";
import { createAiDatabaseAdapter } from "../../infra/database.js";
import { agentInstructionDocumentKey } from "./base-documents.js";

export interface AgentInstructionExtras {
  /** Effective AGENTS.md body when a tenant/user override exists. */
  agentsOverrideBody: string | null;
  /** Appended instruction bodies (after AGENTS.md), ordered by document_key. */
  appendBodies: string[];
  /** Effective SKILLS.md body when a tenant/user override exists. */
  skillsOverrideBody: string | null;
  /** Effective SOUL.md body when a tenant/user override exists. */
  soulOverrideBody: string | null;
}

async function resolveScopedBody(
  store: ReturnType<typeof createInstructionOverridesStore>,
  params: {
    documentKey: string;
    tenantId: string;
    userId: string;
  }
): Promise<string | null> {
  const [userOverride, tenantOverride] = await Promise.all([
    store.getScopedOverride({
      documentKey: params.documentKey,
      scope: "user",
      tenantId: params.tenantId,
      userId: params.userId,
    }),
    store.getScopedOverride({
      documentKey: params.documentKey,
      scope: "tenant",
      tenantId: params.tenantId,
      userId: params.userId,
    }),
  ]);
  return userOverride?.body ?? tenantOverride?.body ?? null;
}

export async function resolveAgentInstructionExtras(params: {
  agentId: string;
  tenantId: string;
  userId: string;
}): Promise<AgentInstructionExtras> {
  const empty: AgentInstructionExtras = {
    agentsOverrideBody: null,
    appendBodies: [],
    skillsOverrideBody: null,
    soulOverrideBody: null,
  };
  const db = createAiDatabaseAdapter();
  if (!db) {
    return empty;
  }
  const store = createInstructionOverridesStore(db);
  const agentsKey = agentInstructionDocumentKey(params.agentId);
  const isCopilot = params.agentId === "engenty.copilot";
  const soulKey = isCopilot
    ? ENGENTY_COPILOT_SOUL_KEY
    : `${params.agentId}.soul`;
  const skillsKey = isCopilot
    ? ENGENTY_COPILOT_SKILLS_KEY
    : `${params.agentId}.skills`;

  const [agentsOverrideBody, soulOverrideBody, skillsOverrideBody, appendDocs] =
    await Promise.all([
      resolveScopedBody(store, {
        documentKey: isCopilot ? ENGENTY_COPILOT_AGENTS_KEY : agentsKey,
        tenantId: params.tenantId,
        userId: params.userId,
      }),
      resolveScopedBody(store, {
        documentKey: soulKey,
        tenantId: params.tenantId,
        userId: params.userId,
      }),
      resolveScopedBody(store, {
        documentKey: skillsKey,
        tenantId: params.tenantId,
        userId: params.userId,
      }),
      store.listAppendDocumentsForAgent({
        agentId: params.agentId,
        tenantId: params.tenantId,
        userId: params.userId,
      }),
    ]);

  return {
    agentsOverrideBody,
    appendBodies: appendDocs
      .map((document) => document.body.trim())
      .filter((body) => body.length > 0),
    skillsOverrideBody,
    soulOverrideBody,
  };
}
