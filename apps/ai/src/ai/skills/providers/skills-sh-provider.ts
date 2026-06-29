// skills.sh / agentskill.sh registry provider. Public API, no key required.
//   search:  GET /api/agent/search?q=<query>&limit=<n>
//   install: GET /api/agent/skills/<slug>/install   (returns SKILL.md content)
// Responses are parsed defensively because the public payload shape is loosely
// documented; the provider is injectable (fetchImpl + baseUrl) for testing.

import type {
  FetchedSkill,
  FetchedSkillFile,
  SkillRef,
  SkillRegistryProvider,
  SkillSearchResult,
} from "./types.js";

const DEFAULT_BASE_URL = "https://agentskill.sh";

export interface SkillsShProviderOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

// Normalize a registry slug to a valid local skill name (last path segment).
function skillNameFromSlug(slug: string): string {
  const last = slug.split("/").filter(Boolean).at(-1) ?? slug;
  return last
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseSearchResult(raw: unknown): SkillSearchResult | null {
  const record = asRecord(raw);
  const slug =
    asString(record.slug) ??
    asString(record.id) ??
    (asString(record.owner) && asString(record.name)
      ? `${asString(record.owner)}/${asString(record.name)}`
      : undefined);
  const name =
    asString(record.name) ?? (slug ? skillNameFromSlug(slug) : undefined);
  if (!(slug && name)) {
    return null;
  }
  return {
    description: asString(record.description),
    name: skillNameFromSlug(name),
    ref: { id: slug },
    ...(Array.isArray(record.tags)
      ? { tags: record.tags.filter((t): t is string => typeof t === "string") }
      : {}),
    ...(asString(record.version) ? { version: asString(record.version) } : {}),
  };
}

function extractSkillMarkdown(
  record: Record<string, unknown>
): string | undefined {
  const raw =
    asString(record.skillMd) ??
    asString(record.content) ??
    asString(record.markdown) ??
    asString(asRecord(record.skill).content) ??
    asString(asRecord(record.skill).skillMd);
  return raw ? stripAgentskillShHeader(raw) : undefined;
}

// The install endpoint prepends a # comment block (slug, sha, auto-review
// instructions) to the SKILL.md content. All useful data is already present
// in the JSON response fields; the block renders as markdown headings when
// kept, so strip it before storing.
function stripAgentskillShHeader(markdown: string): string {
  return markdown
    .replace(/^# --- agentskill\.sh ---[\s\S]*?^# ---$/m, "")
    .trimStart();
}

function extractFiles(record: Record<string, unknown>): FetchedSkillFile[] {
  const raw = Array.isArray(record.files) ? record.files : [];
  const files: FetchedSkillFile[] = [];
  for (const entry of raw) {
    const file = asRecord(entry);
    const path = asString(file.path) ?? asString(file.name);
    if (!path || path === "SKILL.md") {
      continue;
    }
    files.push({
      path,
      ...(asString(file.contentBase64)
        ? { contentBase64: asString(file.contentBase64) }
        : {}),
      ...(asString(file.content) ? { text: asString(file.content) } : {}),
    });
  }
  return files;
}

export function createSkillsShProvider(
  options: SkillsShProviderOptions = {}
): SkillRegistryProvider {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  async function getJson(url: string): Promise<unknown> {
    const response = await fetchImpl(url, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`skills_sh_request_failed:${response.status}`);
    }
    return response.json();
  }

  return {
    id: "skills_sh",
    label: "skills.sh",

    async search(query, opts) {
      const limit = opts?.pageSize ?? 10;
      const url = `${baseUrl}/api/agent/search?q=${encodeURIComponent(query)}&limit=${limit}`;
      const data = await getJson(url);
      const list = Array.isArray(data)
        ? data
        : (asRecord(data).skills ?? asRecord(data).results ?? []);
      const results: SkillSearchResult[] = [];
      for (const raw of Array.isArray(list) ? list : []) {
        const parsed = parseSearchResult(raw);
        if (parsed) {
          results.push(parsed);
        }
      }
      return results;
    },

    async fetchSkill(ref: SkillRef): Promise<FetchedSkill> {
      const slug = ref.id;
      const data = await getJson(
        `${baseUrl}/api/agent/skills/${encodeURIComponent(slug)}/install`
      );
      const record = asRecord(data);
      const skillMarkdown = extractSkillMarkdown(record);
      if (!skillMarkdown) {
        throw new Error(`skills_sh_missing_content:${slug}`);
      }
      const files = extractFiles(record);
      return {
        name: skillNameFromSlug(asString(record.slug) ?? slug),
        skillMarkdown,
        ...(files.length > 0 ? { files } : {}),
        ...((asString(record.sha) ?? asString(record.contentSha))
          ? { sha: asString(record.sha) ?? asString(record.contentSha) }
          : {}),
        ...(asString(record.version)
          ? { version: asString(record.version) }
          : {}),
      };
    },
  };
}
