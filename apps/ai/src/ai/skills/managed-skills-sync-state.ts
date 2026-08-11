// Process-local state for the managed-skills seed + catalog list path.
//
// - `syncedTenants`: one successful seed per tenant per process (shared by the
//   agent workspace hook and `/ai/skills` catalog routes).
// - `summariesByTenant`: in-memory managed-tier SkillSummary[] built from the
//   code packs after a seed, so `listSkills` does not re-download every SKILL.md.

import type { SkillSummary } from "./skill-frontmatter.js";

const syncedTenants = new Set<string>();
const summariesByTenant = new Map<string, SkillSummary[]>();

export function hasSyncedManagedSkills(tenantId: string): boolean {
  return syncedTenants.has(tenantId.trim());
}

export function markManagedSkillsSynced(tenantId: string): void {
  syncedTenants.add(tenantId.trim());
}

export function clearManagedSkillsSynced(tenantId: string): void {
  const id = tenantId.trim();
  syncedTenants.delete(id);
  summariesByTenant.delete(id);
}

export function getManagedSkillSummariesCache(
  tenantId: string
): SkillSummary[] | undefined {
  const cached = summariesByTenant.get(tenantId.trim());
  return cached ? cached.map((row) => ({ ...row })) : undefined;
}

export function setManagedSkillSummariesCache(
  tenantId: string,
  summaries: SkillSummary[]
): void {
  summariesByTenant.set(
    tenantId.trim(),
    summaries.map((row) => ({ ...row }))
  );
}

export function clearManagedSkillSummariesCache(tenantId: string): void {
  summariesByTenant.delete(tenantId.trim());
}

/** Test helper — drop all process-local seed / summary state. */
export function resetManagedSkillsSyncStateForTests(): void {
  syncedTenants.clear();
  summariesByTenant.clear();
}
