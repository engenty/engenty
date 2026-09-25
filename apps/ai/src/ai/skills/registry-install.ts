// Search / install a skill from an external registry (skills.sh) into the
// tenant `custom` tier, then optionally mount it on a space and add it to a
// custom agent's preferred `skillIds`. Shared by `/ai/skills/registry/install`
// and the `skills_find` / `skills_install` tools.

import { assertValidAgentSkillName } from "@engenty/ai-core";
import type { RegistryStore } from "../../dal/registry/index.js";
import {
  type EngentyCoreClient,
  EngentyCoreHttpError,
} from "../core-http-client.js";
import type {
  FetchedSkillFile,
  SkillRegistryProvider,
  SkillSearchResult,
} from "./providers/types.js";
import type { SkillDetail } from "./skill-frontmatter.js";
import { parseSkillMarkdown } from "./skill-frontmatter.js";
import type { SkillFileInput, SkillStorage } from "./skill-storage.js";

export interface SkillsFindHit extends SkillSearchResult {
  already_in_space: boolean;
  already_installed: boolean;
  already_preferred: boolean;
  url: string;
}

export interface SkillsFindAttachTarget {
  agent: { can_prefer: boolean; id: string } | null;
  space: { id: string } | null;
}

export interface SkillsFindPayload {
  attach: SkillsFindAttachTarget;
  provider: { id: string; label: string };
  query: string;
  results: SkillsFindHit[];
}

export interface SkillAttachAttempt {
  error?: string;
  id: string;
  ok: boolean;
}

export interface InstallSkillFromRegistryResult {
  attached: {
    agent: SkillAttachAttempt | null;
    space: SkillAttachAttempt | null;
  };
  skill: SkillDetail;
}

export interface InstallSkillFromRegistryInput {
  agentId?: string | null;
  core?: EngentyCoreClient | null;
  provider: SkillRegistryProvider;
  refId: string;
  registryStore?: Pick<RegistryStore, "getAgentConfig" | "upsertAgent"> | null;
  spaceId?: string | null;
  storage: Pick<SkillStorage, "upsertCustomSkill">;
  tenantId: string;
}

const SKILLS_SH_BROWSE = "https://skills.sh";

function skillsShUrl(refId: string): string {
  return `${SKILLS_SH_BROWSE}/${refId.replace(/^\/+/, "")}`;
}

function fetchedFilesToInputs(files?: FetchedSkillFile[]): SkillFileInput[] {
  const encoder = new TextEncoder();
  const out: SkillFileInput[] = [];
  for (const file of files ?? []) {
    if (typeof file.contentBase64 === "string") {
      out.push({
        bytes: Uint8Array.from(Buffer.from(file.contentBase64, "base64")),
        path: file.path,
      });
    } else if (typeof file.text === "string") {
      out.push({ bytes: encoder.encode(file.text), path: file.path });
    }
  }
  return out;
}

export function annotateRegistryHits(input: {
  agentPreferred?: ReadonlySet<string>;
  browseUrl?: (ref: SkillSearchResult["ref"]) => string;
  installed: ReadonlySet<string>;
  results: SkillSearchResult[];
  spaceMounted?: ReadonlySet<string>;
}): SkillsFindHit[] {
  const browseUrl = input.browseUrl ?? ((ref) => skillsShUrl(ref.id));
  return input.results.map((hit) => ({
    ...hit,
    already_in_space: input.spaceMounted?.has(hit.name) ?? false,
    already_installed: input.installed.has(hit.name),
    already_preferred: input.agentPreferred?.has(hit.name) ?? false,
    url: browseUrl(hit.ref),
  }));
}

export async function buildSkillsFindPayload(input: {
  agent?: { canPrefer: boolean; id: string; preferredSkillIds?: string[] };
  provider: SkillRegistryProvider;
  query: string;
  space?: { id: string; mountedSkillNames?: string[] };
  storage: Pick<SkillStorage, "listSkills">;
}): Promise<SkillsFindPayload> {
  const [results, catalog] = await Promise.all([
    input.provider.search(input.query),
    input.storage.listSkills(),
  ]);
  const installed = new Set(catalog.map((row) => row.name));
  const spaceMounted = new Set(input.space?.mountedSkillNames ?? []);
  const agentPreferred = new Set(input.agent?.preferredSkillIds ?? []);
  return {
    attach: {
      agent: input.agent
        ? { can_prefer: input.agent.canPrefer, id: input.agent.id }
        : null,
      space: input.space ? { id: input.space.id } : null,
    },
    provider: { id: input.provider.id, label: input.provider.label },
    query: input.query,
    results: annotateRegistryHits({
      agentPreferred,
      ...(input.provider.browseUrl
        ? { browseUrl: input.provider.browseUrl.bind(input.provider) }
        : {}),
      installed,
      results,
      spaceMounted,
    }),
  };
}

export async function mountSkillOnSpace(
  core: EngentyCoreClient,
  spaceId: string,
  skillName: string
): Promise<SkillAttachAttempt> {
  try {
    await core.putSpaceMount(spaceId, {
      resource_key: skillName,
      resource_type: "skill",
    });
    return { id: spaceId, ok: true };
  } catch (error) {
    const message =
      error instanceof EngentyCoreHttpError
        ? error.message
        : error instanceof Error
          ? error.message
          : "space_mount_failed";
    return { error: message, id: spaceId, ok: false };
  }
}

async function preferSkillOnAgent(
  store: Pick<RegistryStore, "getAgentConfig" | "upsertAgent">,
  tenantId: string,
  agentId: string,
  skillName: string
): Promise<SkillAttachAttempt> {
  try {
    const existing = await store.getAgentConfig(tenantId, agentId);
    if (!existing) {
      return {
        error:
          "Agent is not a custom registry agent; preferred skills are not persisted.",
        id: agentId,
        ok: false,
      };
    }
    if (existing.skillIds.includes(skillName)) {
      return { id: agentId, ok: true };
    }
    await store.upsertAgent(tenantId, {
      ...existing,
      skillIds: [...existing.skillIds, skillName],
    });
    return { id: agentId, ok: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "agent_prefer_failed",
      id: agentId,
      ok: false,
    };
  }
}

export async function installSkillFromRegistryAndAttach(
  input: InstallSkillFromRegistryInput
): Promise<InstallSkillFromRegistryResult> {
  const fetched = await input.provider.fetchSkill({ id: input.refId });
  const parsed = parseSkillMarkdown(fetched.skillMarkdown);
  assertValidAgentSkillName(fetched.name);
  const saved = await input.storage.upsertCustomSkill({
    body: parsed.body,
    frontmatter: {
      ...parsed.frontmatter,
      engenty: {
        ...parsed.frontmatter.engenty,
        originRef: input.refId,
        source: input.provider.id,
        ...(fetched.sha ? { installedSha: fetched.sha } : {}),
      },
    },
    files: fetchedFilesToInputs(fetched.files),
    name: fetched.name,
  });

  const spaceId = input.spaceId?.trim() || null;
  const agentId = input.agentId?.trim() || null;

  const attached = {
    agent: null as SkillAttachAttempt | null,
    space: null as SkillAttachAttempt | null,
  };
  if (spaceId) {
    if (input.core) {
      attached.space = await mountSkillOnSpace(input.core, spaceId, saved.name);
    } else {
      attached.space = {
        error:
          "Space mount was requested but no core client is available to verify permission.",
        id: spaceId,
        ok: false,
      };
    }
  }
  if (agentId && input.registryStore) {
    attached.agent = await preferSkillOnAgent(
      input.registryStore,
      input.tenantId,
      agentId,
      saved.name
    );
  }

  return {
    attached,
    skill: saved,
  };
}
