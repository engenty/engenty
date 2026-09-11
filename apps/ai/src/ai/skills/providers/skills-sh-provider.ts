// skills.sh registry provider. Public API, no key required.
//   search:  GET /api/search?q=<query>&limit=<n>
//   install: GET /r/<owner>/<repo>/<skill>   (shadcn registry-item JSON)
// The documented /api/v1/* surface requires a Vercel OIDC token; the website
// search and /r/ snapshot do not. Responses are parsed defensively because the
// public payload shape is loosely documented; the provider is injectable
// (fetchImpl + baseUrl) for testing.

import type {
  FetchedSkill,
  FetchedSkillFile,
  SkillRef,
  SkillRegistryProvider,
  SkillSearchResult,
} from "./types.js";

const DEFAULT_BASE_URL = "https://skills.sh";

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

function fileText(file: Record<string, unknown>): string | undefined {
  return (
    asString(file.content) ?? asString(file.contents) ?? asString(file.text)
  );
}

function filePath(file: Record<string, unknown>): string | undefined {
  return asString(file.path) ?? asString(file.name);
}

function isSkillMarkdownPath(path: string): boolean {
  return path === "SKILL.md" || path.endsWith("/SKILL.md");
}

// Normalize a registry slug to a valid local skill name (last path segment).
function skillNameFromSlug(slug: string): string {
  const last = slug.split("/").filter(Boolean).at(-1) ?? slug;
  return last
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function registryItemPath(slug: string): string {
  return slug
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
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
    asString(record.name) ??
    asString(record.skillId) ??
    (slug ? skillNameFromSlug(slug) : undefined);
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

function extractSkillMarkdownFromFiles(files: unknown[]): string | undefined {
  let nested: string | undefined;
  for (const entry of files) {
    const file = asRecord(entry);
    const path = filePath(file);
    const text = fileText(file);
    if (!(path && text && isSkillMarkdownPath(path))) {
      continue;
    }
    if (path === "SKILL.md") {
      return text;
    }
    nested ??= text;
  }
  return nested;
}

function extractSkillMarkdown(
  record: Record<string, unknown>
): string | undefined {
  const raw =
    asString(record.skillMd) ??
    asString(record.content) ??
    asString(record.markdown) ??
    asString(asRecord(record.skill).content) ??
    asString(asRecord(record.skill).skillMd) ??
    (Array.isArray(record.files)
      ? extractSkillMarkdownFromFiles(record.files)
      : undefined);
  return raw ? stripAgentskillShHeader(raw) : undefined;
}

// Older agentskill.sh payloads prepend a # comment block. Harmless no-op for
// skills.sh snapshots; kept so mixed/legacy fixtures still store clean markdown.
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
    const path = filePath(file);
    if (!path || path === "SKILL.md") {
      continue;
    }
    const text = fileText(file);
    files.push({
      path,
      ...(asString(file.contentBase64)
        ? { contentBase64: asString(file.contentBase64) }
        : {}),
      ...(text ? { text } : {}),
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
      const url = `${baseUrl}/api/search?q=${encodeURIComponent(query)}&limit=${limit}`;
      const data = await getJson(url);
      const record = asRecord(data);
      const list = Array.isArray(data)
        ? data
        : (record.skills ?? record.results ?? record.data ?? []);
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
      const data = await getJson(`${baseUrl}/r/${registryItemPath(slug)}`);
      const record = asRecord(data);
      const skillMarkdown = extractSkillMarkdown(record);
      if (!skillMarkdown) {
        throw new Error(`skills_sh_missing_content:${slug}`);
      }
      const files = extractFiles(record);
      const sha =
        asString(record.sha) ??
        asString(record.hash) ??
        asString(record.contentSha);
      return {
        name: skillNameFromSlug(
          asString(record.name) ?? asString(record.slug) ?? slug
        ),
        skillMarkdown,
        ...(files.length > 0 ? { files } : {}),
        ...(sha ? { sha } : {}),
        ...(asString(record.version)
          ? { version: asString(record.version) }
          : {}),
      };
    },
  };
}
