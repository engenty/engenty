// Pluggable external skill-registry providers. A provider lets the admin search
// a remote catalog (e.g. skills.sh) and download a skill folder; the installed
// skill is written into the tenant's editable `custom` tier. New registries
// (private/self-hosted, GitHub repo, agentskills push/pull) just implement this
// interface and register — no route or UI changes.

export interface SkillRef {
  // Provider-specific opaque identifier, e.g. "owner/repo/skill-id".
  id: string;
}

export interface SkillSearchResult {
  description?: string;
  name: string;
  ref: SkillRef;
  tags?: string[];
  version?: string;
}

export interface FetchedSkillFile {
  // Base64-encoded bytes for binary-safe transport (mutually exclusive with text).
  contentBase64?: string;
  // Path relative to the skill folder, e.g. "references/x.md".
  path: string;
  text?: string;
}

export interface FetchedSkill {
  files?: FetchedSkillFile[];
  name: string;
  // Upstream version hash, recorded as `engenty.installedSha`.
  sha?: string;
  // Full SKILL.md content (with frontmatter).
  skillMarkdown: string;
  version?: string;
}

export interface SkillProviderSearchOptions {
  page?: number;
  pageSize?: number;
}

export interface SkillRegistryProvider {
  /** A page about the skill for people; absent → the skills.sh page. */
  browseUrl?(ref: SkillRef): string;
  fetchSkill(ref: SkillRef): Promise<FetchedSkill>;
  // Stable id, e.g. "skills_sh". Stored as the installed skill's `source`.
  id: string;
  // Human-readable name for the provider picker.
  label: string;
  search(
    query: string,
    opts?: SkillProviderSearchOptions
  ): Promise<SkillSearchResult[]>;
}
