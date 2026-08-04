// Base (non-override) instruction documents, derived live from the AI registry.
//
// File-derived seeds: each agent exposes the markdown files listed in
// `agent.json` → `instruction_files` (default: AGENTS.md). Bodies are the raw
// file contents — never the fully compiled system prompt.
// These documents are never stored — they are computed on demand and merged with
// the persisted tenant/user overrides to form the admin catalog.

import {
  copilotAgentAssetLocator,
  createEngentyCopilotInstructionDocuments,
  type InstructionDocumentDefinition,
  loadAgentManifest,
  readCopilotInstructionFile,
} from "@engenty/ai-core";
import type { AgentConfig, AiRegistry } from "../registry/types.js";
import type { AiInstructionDocument } from "./types.js";

/** Stable instruction-store key for an agent's AGENTS.md (e.g. `engenty.copilot.agents`). */
export function agentInstructionDocumentKey(agentId: string): string {
  return `${agentId}.agents`;
}

/** `${agentId}.${basename}` — AGENTS.md → engenty.copilot.agents */
export function agentInstructionFileDocumentKey(
  agentId: string,
  filename: string
): string {
  const stem = filename.replace(/\.md$/i, "").trim().toLowerCase();
  return `${agentId}.${stem}`;
}

/** Module bucket for an agent id, matching the admin catalog's grouping. */
function moduleIdForAgent(agentId: string): string {
  if (agentId.startsWith("engenty.")) {
    return "engenty";
  }
  return agentId.split(".")[0] ?? "engenty";
}

function definitionToBaseDocument(
  definition: InstructionDocumentDefinition,
  nowIso: string
): AiInstructionDocument {
  return {
    body: definition.default_body.trim(),
    created_at: nowIso,
    created_by_user_id: null,
    document_key: definition.key,
    id: definition.key,
    is_active: true,
    layer: "agent",
    metadata: {
      filename: definition.filename,
      owner_id: definition.owner_id,
      owner_kind: definition.owner_kind,
    },
    module_id: definition.module_id,
    source_kind: "seed",
    tenant_id: null,
    title: definition.title,
    updated_at: nowIso,
    updated_by_user_id: null,
    version: 1,
  };
}

function toAgentsOnlyDocument(
  config: AgentConfig,
  nowIso: string
): AiInstructionDocument {
  const documentKey = agentInstructionDocumentKey(config.id);
  return {
    body: config.instructions.trim(),
    created_at: nowIso,
    created_by_user_id: null,
    document_key: documentKey,
    id: documentKey,
    is_active: true,
    layer: "agent",
    metadata: {
      filename: "AGENTS.md",
      owner_id: config.id,
      owner_kind: "agent",
    },
    module_id: moduleIdForAgent(config.id),
    source_kind: "seed",
    tenant_id: null,
    title: config.name ?? config.id,
    updated_at: nowIso,
    updated_by_user_id: null,
    version: 1,
  };
}

/** Resolve `instruction_files` from the agent manifest when available. */
function instructionFilesForAgent(config: AgentConfig): string[] {
  if (config.id === "engenty.copilot") {
    try {
      const manifest = loadAgentManifest(copilotAgentAssetLocator);
      if (manifest.instruction_files.length > 0) {
        return manifest.instruction_files;
      }
    } catch {
      // Fall through to the known defaults.
    }
    return ["AGENTS.md", "SOUL.md", "SKILLS.md"];
  }
  return ["AGENTS.md"];
}

function toBaseDocumentsForAgent(
  config: AgentConfig,
  nowIso: string
): AiInstructionDocument[] {
  if (config.id === "engenty.copilot") {
    try {
      // Prefer the shared definitions (filenames + titles + fresh seed bodies).
      const wanted = new Set(
        instructionFilesForAgent(config).map((filename) =>
          agentInstructionFileDocumentKey(config.id, filename)
        )
      );
      return createEngentyCopilotInstructionDocuments()
        .filter((definition) => wanted.has(definition.key))
        .map((definition) => definitionToBaseDocument(definition, nowIso));
    } catch (error) {
      // Seed path resolution can fail when ai-core is imported from an unexpected
      // layout — still expose AGENTS.md from the compiled agent config so the
      // Instructions sidebar is never empty for the builtin copilot.
      console.warn(
        "[instructions] failed to load engenty.copilot seed files; falling back to config.instructions",
        error
      );
      return [toAgentsOnlyDocument(config, nowIso)];
    }
  }
  return [toAgentsOnlyDocument(config, nowIso)];
}

type ListableRegistry = AiRegistry & {
  listAgentConfigs?: () => Promise<AgentConfig[]>;
};

async function listAgentConfigs(registry: AiRegistry): Promise<AgentConfig[]> {
  const listable = registry as ListableRegistry;
  if (typeof listable.listAgentConfigs === "function") {
    return await listable.listAgentConfigs();
  }
  return [];
}

/** All file-derived base documents (instruction_files per registered agent). */
export async function listBaseInstructionDocuments(
  registry: AiRegistry,
  nowIso: string
): Promise<AiInstructionDocument[]> {
  const configs = await listAgentConfigs(registry);
  return configs.flatMap((config) => toBaseDocumentsForAgent(config, nowIso));
}

/** The single base document for a key, or null when no agent owns it. */
export async function getBaseInstructionDocumentByKey(
  registry: AiRegistry,
  documentKey: string,
  nowIso: string
): Promise<AiInstructionDocument | null> {
  const configs = await listAgentConfigs(registry);
  for (const config of configs) {
    const match = toBaseDocumentsForAgent(config, nowIso).find(
      (document) => document.document_key === documentKey
    );
    if (match) {
      return match;
    }
  }
  // Last-resort: known copilot seed files even if the agent isn't listed yet.
  if (documentKey.startsWith("engenty.copilot.")) {
    const stem = documentKey.slice("engenty.copilot.".length);
    const filename = `${stem.toUpperCase()}.md`;
    try {
      const body = readCopilotInstructionFile(
        stem === "agents"
          ? "AGENTS.md"
          : stem === "soul"
            ? "SOUL.md"
            : stem === "skills"
              ? "SKILLS.md"
              : filename
      );
      return {
        body: body.trim(),
        created_at: nowIso,
        created_by_user_id: null,
        document_key: documentKey,
        id: documentKey,
        is_active: true,
        layer: "agent",
        metadata: {
          filename:
            stem === "agents"
              ? "AGENTS.md"
              : stem === "soul"
                ? "SOUL.md"
                : stem === "skills"
                  ? "SKILLS.md"
                  : filename,
          owner_id: "engenty.copilot",
          owner_kind: "agent",
        },
        module_id: "engenty",
        source_kind: "seed",
        tenant_id: null,
        title: documentKey,
        updated_at: nowIso,
        updated_by_user_id: null,
        version: 1,
      };
    } catch {
      return null;
    }
  }
  return null;
}
