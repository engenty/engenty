// Core admin HTTP client for actions catalog CRUD and seed rebuild
// (`/api/admin/ai/*`). Skills are no longer DB-backed: the skill functions below
// delegate to the file-storage skill catalog on apps/ai (`/ai/skills`) and adapt
// the tiered file-storage shape into the legacy `AiSkillRecord`/catalog shapes so
// the shared agent shell and skill resolution keep working unchanged.

import { requestAiServiceJson } from "../runtime/ai-service-client.js";
import {
  deleteFileStorageSkill,
  type FileStorageSkillDetail,
  type FileStorageSkillSummary,
  getFileStorageSkill,
  getFileStorageSkills,
  upsertFileStorageSkill,
} from "../runtime/skills-api.js";
import type {
  AiFileRecord,
  AiRegisteredAction,
  AiSkillCatalogEntry,
  AiSkillMetadata,
  AiSkillRecord,
  CreateAiSkillInput,
  UpdateAiSkillInput,
} from "./ai-runtime-types.js";

// Map a file-storage skill `source` (module|builtin|upload|<provider id>) to the
// module id the legacy admin grouping expects.
function moduleIdFromSource(source: string): string | null {
  if (source === "builtin" || source === "module") {
    return "engenty-core";
  }
  if (source === "library" || source === "upload") {
    return null;
  }
  return source;
}

function skillMetadataForSource(source: string): AiSkillMetadata {
  const moduleId = moduleIdFromSource(source);
  if (!moduleId) {
    return {};
  }
  return { module_id: moduleId };
}

function summaryToSkillRecord(summary: FileStorageSkillSummary): AiSkillRecord {
  const moduleId = moduleIdFromSource(summary.source);
  return {
    allowed_tools: summary.allowed_tools,
    body_markdown: null,
    compatibility: null,
    created_at: "",
    description: summary.description || null,
    editable: summary.editable,
    engenty_modules:
      summary.engenty_modules.length > 0
        ? summary.engenty_modules
        : moduleId
          ? [moduleId]
          : [],
    has_tenant_override: false,
    last_seeded_at: null,
    last_synced_at: null,
    license: null,
    metadata: skillMetadataForSource(summary.source),
    metadata_order: [],
    name: summary.name,
    owner_id: "",
    owner_kind: summary.tier === "custom" ? "tenant" : "module",
    record_id: summary.name,
    reference_kind: summary.tier === "custom" ? "tenant" : "module",
    source_kind: summary.tier === "custom" ? "user" : "seed",
    source_reference: summary.source,
    tenant_id: null,
    tier: summary.tier,
    requires_sandbox: summary.requires_sandbox,
    title: summary.title ?? null,
    updated_at: "",
  };
}

function detailToSkillRecord(detail: FileStorageSkillDetail): AiSkillRecord {
  return {
    ...summaryToSkillRecord(detail),
    body_markdown: detail.body,
  };
}

// Module-shipped workflow actions are read-only — the wire shape IS the model.
export function getAiWorkflows(
  signal?: AbortSignal
): Promise<{ workflows: AiRegisteredAction[] }> {
  return requestAiServiceJson<{ workflows: AiRegisteredAction[] }>(
    "/ai/v1/workflows/catalog",
    { signal }
  );
}

export async function getAiSkillCatalog(signal?: AbortSignal) {
  const { skills } = await getFileStorageSkills(signal);
  return {
    skills: skills.map(
      (summary): AiSkillCatalogEntry => ({
        allowed_tools: summary.allowed_tools,
        compatibility: null,
        description: summary.description || null,
        editable: summary.editable,
        engenty_modules: summary.engenty_modules,
        license: null,
        metadata: skillMetadataForSource(summary.source),
        name: summary.name,
        origins: [],
        requires_sandbox: summary.requires_sandbox,
        source: summary.source,
        tier: summary.tier,
        title: summary.title ?? null,
      })
    ),
  };
}

export async function getAiSkills(signal?: AbortSignal) {
  const { skills } = await getFileStorageSkills(signal);
  return { skills: skills.map(summaryToSkillRecord) };
}

export async function getAiSkillDetail(skillId: string, signal?: AbortSignal) {
  const { skill } = await getFileStorageSkill(skillId, signal);
  const files: AiFileRecord[] = skill.files.map((file) => ({
    content_hash: "",
    content_text: "",
    last_seeded_at: null,
    last_synced_at: null,
    logical_path: file.path.replace(/^\/+/, ""),
    module_id: moduleIdFromSource(skill.source) ?? "",
    owner_key: skill.name,
    owner_type: "skill",
    reference_kind: skill.tier === "custom" ? "tenant" : "module",
    source_kind: skill.tier === "custom" ? "user" : "seed",
    source_reference: skill.source,
    tenant_id: null,
    updated_at: "",
  }));
  return { files, skill: detailToSkillRecord(skill) };
}

// Custom-tier only — managed skills are rejected (409) server-side.
export async function createAiSkill(input: CreateAiSkillInput) {
  const { skill } = await upsertFileStorageSkill({
    body: input.body_markdown ?? "",
    frontmatter: {
      ...(input.description ? { description: input.description } : {}),
      ...(input.title ? { title: input.title } : {}),
    },
    name: input.name,
  });
  return { skill: detailToSkillRecord(skill) };
}

export async function updateAiSkill(input: UpdateAiSkillInput) {
  const { skill } = await upsertFileStorageSkill({
    body: input.body_markdown ?? "",
    frontmatter: {
      ...(input.description ? { description: input.description } : {}),
      ...(input.title ? { title: input.title } : {}),
    },
    name: input.skillId,
  });
  return { skill: detailToSkillRecord(skill) };
}

export function deleteAiSkill(skillId: string) {
  return deleteFileStorageSkill(skillId);
}

export async function getAiWorkflowDetail(
  workflowId: string,
  signal?: AbortSignal
): Promise<{ workflow: AiRegisteredAction }> {
  const { workflows } = await getAiWorkflows(signal);
  const found = workflows.find((a) => a.id === workflowId);
  if (!found) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }
  return { workflow: found };
}
