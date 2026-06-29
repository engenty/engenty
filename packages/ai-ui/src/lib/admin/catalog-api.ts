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
  AiActionRecord,
  AiFileRecord,
  AiRegisteredAction,
  AiSkillCatalogEntry,
  AiSkillRecord,
  CreateAiSkillInput,
  UpdateAiSkillInput,
} from "./ai-runtime-types.js";

// apps/ai `GET /ai/v1/actions` item — code-defined actions are read-only.
interface AppsAiActionItem {
  agent_id: string;
  allowed_tools?: string[];
  context_type?: string | null;
  default_thread_mode: "reuse" | "new" | "none";
  description: string | null;
  id: string;
  input_schema_json: Record<string, unknown> | null;
  instruction_keys?: string[];
  module_id: string;
  name: string;
  prompt?: string;
  skills?: string[];
}

// Adapt the apps/ai action shape into the legacy admin `AiActionRecord` so the
// catalog + detail pages render read-only without a parallel model. Code-defined
// actions are always `source_kind: "seed"` → the detail page hides edit/delete.
function toAppsAiActionRecord(a: AppsAiActionItem): AiActionRecord {
  const isCore = a.module_id === "engenty-core";
  const schema = a.input_schema_json ?? { type: "object" };
  return {
    agent_id: a.agent_id,
    allowed_tools: a.allowed_tools ?? [],
    context_type: a.context_type ?? null,
    created_at: "",
    default_thread_mode: a.default_thread_mode,
    description: a.description ?? null,
    has_input_schema:
      Object.keys(
        (schema as { properties?: Record<string, unknown> }).properties ?? {}
      ).length > 0,
    has_tenant_override: false,
    id: a.id,
    input_schema_json: schema,
    instruction_keys: a.instruction_keys ?? [],
    last_seeded_at: null,
    last_synced_at: null,
    module_id: a.module_id,
    name: a.name,
    owner_id: a.id,
    owner_kind: isCore ? "core" : "module",
    prompt: a.prompt ?? "",
    record_id: a.id,
    reference_kind: isCore ? "core" : "module",
    skills: a.skills ?? [],
    source_kind: "seed",
    source_reference: a.module_id,
    tenant_id: null,
    updated_at: "",
  };
}

// Map a file-storage skill `source` (module|builtin|upload|<provider id>) to the
// module id the legacy admin grouping expects.
function moduleIdFromSource(source: string): string {
  if (source === "builtin" || source === "module") {
    return "engenty-core";
  }
  return source;
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
    metadata: { module_id: moduleId },
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

export async function getAiActions(
  signal?: AbortSignal
): Promise<{ actions: AiRegisteredAction[] }> {
  const { actions } = await requestAiServiceJson<{
    actions: AppsAiActionItem[];
  }>("/ai/v1/actions", { signal });
  return { actions: actions.map(toAppsAiActionRecord) };
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
        metadata: { module_id: moduleIdFromSource(summary.source) },
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
    logical_path: file.path,
    module_id: moduleIdFromSource(skill.source),
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

export async function getAiActionDetail(
  actionId: string,
  signal?: AbortSignal
): Promise<{ action: AiActionRecord; files: AiFileRecord[] }> {
  const { actions } = await requestAiServiceJson<{
    actions: AppsAiActionItem[];
  }>("/ai/v1/actions", { signal });
  const found = actions.find((a) => a.id === actionId);
  if (!found) {
    throw new Error(`Action not found: ${actionId}`);
  }
  // No file backing on the read-only path — the detail page reconstructs the
  // ACTION.md source from the draft when `files` is empty.
  return { action: toAppsAiActionRecord(found), files: [] };
}
