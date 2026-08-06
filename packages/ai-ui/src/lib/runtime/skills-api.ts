// apps/ai file-storage skill catalog client (`/ai/skills`). Skills live in tenant
// file storage split into two tiers: `managed` (code-provided, read-only) and
// `custom` (uploaded / registry-installed, editable). Registry routes are
// provider-agnostic (skills.sh is one provider) and install into the custom tier.

import { requestAiServiceJson } from "./ai-service-client.js";

export type SkillTier = "managed" | "custom";

export interface FileStorageSkillSummary {
  allowed_tools: string[];
  description: string;
  editable: boolean;
  engenty_modules: string[];
  name: string;
  requires_sandbox: boolean;
  source: string;
  tags: string[];
  tier: SkillTier;
  title?: string;
  version?: string;
}

export interface FileStorageSkillFileEntry {
  path: string;
}

export interface FileStorageSkillProvenance {
  installedSha?: string;
  originRef?: string;
  source: string;
}

export interface FileStorageSkillFrontmatter {
  description?: string;
  engenty?: FileStorageSkillProvenance;
  name?: string;
  tags?: string[];
  title?: string;
  version?: string;
  [key: string]: unknown;
}

export interface FileStorageSkillDetail extends FileStorageSkillSummary {
  body: string;
  files: FileStorageSkillFileEntry[];
  frontmatter: FileStorageSkillFrontmatter;
}

export interface SkillRegistryProviderInfo {
  id: string;
  label: string;
}

export interface SkillRegistryRef {
  // Provider-specific opaque identifier, e.g. "owner/repo/skill-id".
  id: string;
}

export interface SkillRegistrySearchResult {
  description?: string;
  name: string;
  ref: SkillRegistryRef;
  tags?: string[];
  title?: string;
  version?: string;
}

export interface UpsertFileStorageSkillInput {
  body: string;
  files?: {
    contentBase64?: string;
    contentType?: string;
    path: string;
    text?: string;
  }[];
  frontmatter?: FileStorageSkillFrontmatter;
  name: string;
}

export function getFileStorageSkills(signal?: AbortSignal) {
  return requestAiServiceJson<{ skills: FileStorageSkillSummary[] }>(
    "/ai/skills",
    { signal }
  );
}

export function getFileStorageSkill(name: string, signal?: AbortSignal) {
  return requestAiServiceJson<{ skill: FileStorageSkillDetail }>(
    `/ai/skills/${encodeURIComponent(name)}`,
    { signal }
  );
}

export function upsertFileStorageSkill(input: UpsertFileStorageSkillInput) {
  const { name, ...body } = input;
  return requestAiServiceJson<{ skill: FileStorageSkillDetail }>(
    `/ai/skills/${encodeURIComponent(name)}`,
    { body: JSON.stringify(body), method: "PUT" }
  );
}

export function deleteFileStorageSkill(name: string) {
  return requestAiServiceJson<{ deleted: boolean }>(
    `/ai/skills/${encodeURIComponent(name)}`,
    { method: "DELETE" }
  );
}

export function reseedManagedSkills(force = false) {
  return requestAiServiceJson<{ skipped: string[]; written: string[] }>(
    "/ai/skills/reseed",
    { body: JSON.stringify({ force }), method: "POST" }
  );
}

export function listSkillRegistryProviders(signal?: AbortSignal) {
  return requestAiServiceJson<{ providers: SkillRegistryProviderInfo[] }>(
    "/ai/skills/registry/providers",
    { signal }
  );
}

export function searchSkillRegistry(
  provider: string,
  query: string,
  signal?: AbortSignal
) {
  const params = new URLSearchParams({ provider, q: query });
  return requestAiServiceJson<{ results: SkillRegistrySearchResult[] }>(
    `/ai/skills/registry/search?${params.toString()}`,
    { signal }
  );
}

export function installSkillFromRegistry(input: {
  provider: string;
  ref: { id: string };
}) {
  return requestAiServiceJson<{ skill: FileStorageSkillDetail }>(
    "/ai/skills/registry/install",
    { body: JSON.stringify(input), method: "POST" }
  );
}
