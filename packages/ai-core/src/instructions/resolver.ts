import type {
  InstructionDocumentDefinition,
  InstructionDocumentRecord,
} from "../contracts.js";
import {
  ENGENTY_COPILOT_AGENTS_KEY,
  ENGENTY_COPILOT_SOUL_KEY,
  resolveRegisteredInstructionDocumentByKey,
} from "./registry.js";

// Lower number = lower precedence (refined by higher layers). `system` is the
// reserved installation base; `tenant` is the tenant-wide base layer.
const LAYER_PRIORITY = new Map([
  ["system", 0],
  ["tenant", 1],
  ["module", 2],
  ["agent", 3],
  ["workflow", 4],
  ["tenant_override", 5],
  ["user_override", 6],
]);

export interface InstructionStore {
  listActiveDocuments(input: {
    keys: string[];
    tenantId?: string | null;
    userId?: string | null;
  }): Promise<InstructionDocumentRecord[]>;
}

function compareDocuments(
  left: InstructionDocumentRecord,
  right: InstructionDocumentRecord
): number {
  const leftPriority = LAYER_PRIORITY.get(left.layer) ?? -1;
  const rightPriority = LAYER_PRIORITY.get(right.layer) ?? -1;
  if (leftPriority !== rightPriority) {
    return rightPriority - leftPriority;
  }
  if (left.version !== right.version) {
    return right.version - left.version;
  }
  return right.updated_at.localeCompare(left.updated_at);
}

function seedToRecord(
  document: InstructionDocumentDefinition
): InstructionDocumentRecord {
  const now = new Date(0).toISOString();
  return {
    body: document.default_body,
    created_at: now,
    created_by_user_id: null,
    document_key: document.key,
    id: document.id,
    is_active: true,
    layer: document.layer,
    metadata: {},
    module_id: document.module_id,
    source_kind: "seed",
    tenant_id: null,
    title: document.title,
    updated_at: now,
    updated_by_user_id: null,
    version: 1,
  };
}

export interface ResolveInstructionLayersInput {
  actionInstructionKeys?: string[];
  agentInstructionKeys?: string[];
  moduleInstructionKeys?: string[];
  store?: InstructionStore | null;
  tenantId?: string | null;
  tenantInstructionKeys?: string[];
  userId?: string | null;
}

export interface ResolvedInstructionLayers {
  documents: InstructionDocumentRecord[];
  text: string;
}

function getOrderedKeys(input: ResolveInstructionLayersInput): string[] {
  return [
    ...(input.tenantInstructionKeys ?? []),
    ...(input.moduleInstructionKeys ?? []),
    ...(input.agentInstructionKeys ?? []),
    ...(input.actionInstructionKeys ?? []),
  ];
}

export async function resolveInstructionLayers(
  input: ResolveInstructionLayersInput
): Promise<ResolvedInstructionLayers> {
  const orderedKeys = getOrderedKeys(input);
  if (orderedKeys.length === 0) {
    return { documents: [], text: "" };
  }

  const storedDocuments = input.store
    ? await input.store.listActiveDocuments({
        keys: orderedKeys,
        tenantId: input.tenantId ?? null,
        userId: input.userId ?? null,
      })
    : [];

  const documents = orderedKeys
    .map((key) => {
      const matches = storedDocuments
        .filter((document) => document.document_key === key)
        .sort(compareDocuments);
      if (matches[0]) {
        return matches[0];
      }
      const seed = resolveRegisteredInstructionDocumentByKey(key);
      return seed ? seedToRecord(seed) : null;
    })
    .filter(
      (document): document is InstructionDocumentRecord => document !== null
    );

  return {
    documents,
    text: documents.map((document) => document.body).join("\n\n"),
  };
}

export interface ResolvedCopilotPromptLayers {
  agentsPrompt?: string;
  soulPrompt?: string;
}

/** Resolve `engenty.copilot` seed instructions (AGENTS.md + SOUL.md) with optional store overrides. */
export async function resolveCopilotPromptLayers(params?: {
  includeAgents?: boolean;
  includeSoul?: boolean;
  store?: InstructionStore | null;
  tenantId?: string | null;
  userId?: string | null;
}): Promise<ResolvedCopilotPromptLayers> {
  const includeAgents = params?.includeAgents ?? true;
  const includeSoul = params?.includeSoul ?? true;

  const resolved = await resolveInstructionLayers({
    tenantInstructionKeys: [
      ...(includeAgents ? [ENGENTY_COPILOT_AGENTS_KEY] : []),
      ...(includeSoul ? [ENGENTY_COPILOT_SOUL_KEY] : []),
    ],
    store: params?.store,
    tenantId: params?.tenantId,
    userId: params?.userId,
  });

  const byKey = new Map(
    resolved.documents.map((document) => [document.document_key, document.body])
  );

  return {
    agentsPrompt: includeAgents
      ? byKey.get(ENGENTY_COPILOT_AGENTS_KEY)
      : undefined,
    soulPrompt: includeSoul ? byKey.get(ENGENTY_COPILOT_SOUL_KEY) : undefined,
  };
}
