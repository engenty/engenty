/**
 * The Knowledge Base module's `mountOperation` (engenty.plugin.json).
 *
 * A space has exactly one knowledge base, and it comes into being HERE: when
 * the module is mounted into the space, through whichever door — the create
 * wizard, the space's setup dialog, an agent's `space_setup`. Nothing else
 * creates one. The hub, the article editor and the space Data tree all assume
 * the row exists and, when it does not, point back at the space's setup.
 *
 * Idempotent: an existing library is answered, never replaced, so re-adding
 * the module — which is how a setup that could not finish is retried — is
 * safe.
 *
 * `needs` names tenant-wide infrastructure the library cannot work without.
 * Today that is the AI gateway: indexing embeds through it, and without a key
 * every ingest fails. The mount still stands — a missing key is fixed once for
 * the tenant, not per space — so it is reported, not refused.
 */
import { readAiGatewayApiKeyFromEnv } from "@engenty/ai-core";
import type { KbRepoFactory } from "../dal/contracts.js";
import type { KnowledgeBase } from "../schema/types.js";

export const KB_SPACE_MOUNT_NEED_AI_GATEWAY = "ai_gateway";

export interface KbSpaceMountResult {
  /** True when this call created the library; false when it already existed. */
  created: boolean;
  knowledge_base: KnowledgeBase;
  needs: string[];
  ready: boolean;
}

/** Tenant-wide infrastructure the library still lacks. */
export function kbSpaceMountNeeds(
  readAiGatewayApiKey: () =>
    | string
    | null
    | undefined = readAiGatewayApiKeyFromEnv
): string[] {
  return readAiGatewayApiKey() ? [] : [KB_SPACE_MOUNT_NEED_AI_GATEWAY];
}

/** `<space name>-kb` — the name a fresh library gets; renamed later in KB settings. */
export function defaultKbNameForSpace(spaceName: string): string {
  return `${spaceName.trim()}-kb`;
}

function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}+/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * `<space key>-kb`, made unique within the tenant. A library keeps its slug
 * when it moves to another space, so the space it left may find its default
 * slug taken when the module is mounted there again.
 */
export function defaultKbSlugForSpace(
  spaceKey: string,
  takenSlugs: ReadonlySet<string>
): string {
  const base = `${slugify(spaceKey) || "space"}-kb`;
  if (!takenSlugs.has(base)) {
    return base;
  }
  let n = 2;
  while (takenSlugs.has(`${base}-${n}`)) {
    n += 1;
  }
  return `${base}-${n}`;
}

export async function ensureSpaceKnowledgeBase(
  repos: Pick<KbRepoFactory, "kb" | "spaces">,
  spaceId: string,
  options: { readAiGatewayApiKey?: () => string | null | undefined } = {}
): Promise<KbSpaceMountResult> {
  const needs = kbSpaceMountNeeds(options.readAiGatewayApiKey);
  const ready = needs.length === 0;
  const [inSpace, space] = await Promise.all([
    repos.kb.list({ spaceId }),
    repos.spaces.getById(spaceId),
  ]);
  if (inSpace[0]) {
    return { created: false, knowledge_base: inSpace[0], needs, ready };
  }
  if (!space) {
    throw new Error(`Space ${spaceId} does not exist in this tenant`);
  }
  const all = await repos.kb.list();
  const knowledge_base = await repos.kb.create({
    description: null,
    name: defaultKbNameForSpace(space.name),
    slug: defaultKbSlugForSpace(space.key, new Set(all.map((kb) => kb.slug))),
    space_id: spaceId,
  });
  return { created: true, knowledge_base, needs, ready };
}
