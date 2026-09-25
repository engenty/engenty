/**
 * Roles: the one concept that replaces purposes, availability flags and
 * per-tenant model lists.
 *
 * A **role** is a job a model does. A **binding** says which model currently
 * does it. That split is the whole point: model ids stop travelling. They exist
 * in the catalog and in the binding table, and nowhere else — so a tenant admin,
 * an agent config and an entitlement package never have to hold an opinion about
 * `openai/gpt-5-mini`.
 *
 * Roles come in two shapes:
 *
 * - **Graded** — general-purpose work, split by how much thinking it deserves:
 *   `model.low` / `model.medium` / `model.high`. This is the only axis an end
 *   user ever picks along, and it is deliberately not called `chat` because the
 *   same role serves tasks and agents.
 * - **Fixed** — a job class with its own requirements, never surfaced to end
 *   users:
 *   - `classifier` — pick one of N options / a score / yes-no, with a
 *     confidence (Jev-like models; an LLM answers via structured output).
 *     Effort routing, inbox categories, KB verification, tool discovery,
 *     guardrails.
 *   - `fast_text` — short plain text or light markdown with simple format
 *     rules, parsed by the caller. No tools, no JSON schema. Titles,
 *     summaries, starters, observational memory.
 *   - `image` — image generation and editing.
 *   - `embedding` — vectors for the search index (fixed 1536 dimensions).
 *   - `video` — video generation.
 *   - `realtime` — the platform default realtime voice model; a workspace's
 *     own voice settings override it.
 *   - `transcription` — speech to text for recorded audio (dictation).
 *
 * Modules may declare their own roles (`coder.plan`, `coder.edit`), which is why
 * a role id is a plain string rather than a closed union: the platform must not
 * need to know what jobs a module invents.
 */

import { bindingPackFor, seedGatewayFromEnv } from "./model-binding-packs.js";
import { DEFAULT_MODEL_GATEWAY_ID, parseModelRef } from "./model-ref.js";

/** How much thinking a piece of work deserves. The only user-facing axis. */
export const AI_EFFORT_LEVELS = ["low", "medium", "high"] as const;
export type AiEffort = (typeof AI_EFFORT_LEVELS)[number];

/**
 * `auto` is not an effort level — it is the absence of a choice, resolved per
 * turn (heuristics first; the `classifier` role only when ambiguous). Kept
 * separate so "the user picked high" and "Auto chose high" stay distinguishable
 * in provenance.
 */
export type AiEffortChoice = AiEffort | "auto";

/** Role id for general-purpose work at a given effort. */
export function graded(effort: AiEffort): string {
  return `model.${effort}`;
}

export const GRADED_ROLE_PREFIX = "model.";

/** Parse `model.high` back into its effort, or null for a fixed role. */
export function effortOfRole(role: string): AiEffort | null {
  if (!role.startsWith(GRADED_ROLE_PREFIX)) {
    return null;
  }
  const suffix = role.slice(GRADED_ROLE_PREFIX.length);
  return (AI_EFFORT_LEVELS as readonly string[]).includes(suffix)
    ? (suffix as AiEffort)
    : null;
}

export interface AiRoleSpec {
  /** Which module declared it; null for platform roles. */
  declaredBy: string | null;
  /** Seed model id, written when the role is first bound (never a fallback). */
  defaultModelId: string;
  /** Human label for the binding console. */
  label: string;
  role: string;
  /** Fixed roles are platform plumbing and never offered to end users. */
  surface: "graded" | "fixed";
}

/**
 * Platform roles and their seeds.
 *
 * Seeds come from `data/model-bindings/<gateway>.json`; `defaultModelId` here
 * is the Vercel pack's value. Every pack must cover every platform role.
 */
const vercelRoles = bindingPackFor(DEFAULT_MODEL_GATEWAY_ID).roles;

function packSeed(role: string): string {
  const seed = vercelRoles[role];
  if (!seed) {
    throw new Error(`data/model-bindings/vercel.json has no "${role}" role`);
  }
  return seed;
}

export const AI_PLATFORM_ROLES: readonly AiRoleSpec[] = [
  {
    declaredBy: null,
    defaultModelId: packSeed("model.low"),
    label: "General · low effort",
    role: "model.low",
    surface: "graded",
  },
  {
    declaredBy: null,
    defaultModelId: packSeed("model.medium"),
    label: "General · medium effort",
    role: "model.medium",
    surface: "graded",
  },
  {
    declaredBy: null,
    defaultModelId: packSeed("model.high"),
    label: "General · high effort",
    role: "model.high",
    surface: "graded",
  },
  {
    declaredBy: null,
    defaultModelId: packSeed("classifier"),
    label: "Classifier",
    role: "classifier",
    surface: "fixed",
  },
  {
    declaredBy: null,
    defaultModelId: packSeed("fast_text"),
    label: "Fast text",
    role: "fast_text",
    surface: "fixed",
  },
  {
    declaredBy: null,
    defaultModelId: packSeed("image"),
    label: "Image generation",
    role: "image",
    surface: "fixed",
  },
  {
    declaredBy: null,
    defaultModelId: packSeed("embedding"),
    label: "Embeddings",
    role: "embedding",
    surface: "fixed",
  },
  {
    declaredBy: null,
    defaultModelId: packSeed("video"),
    label: "Video generation",
    role: "video",
    surface: "fixed",
  },
  {
    declaredBy: null,
    defaultModelId: packSeed("realtime"),
    label: "Voice (realtime)",
    role: "realtime",
    surface: "fixed",
  },
  {
    declaredBy: null,
    defaultModelId: packSeed("transcription"),
    label: "Transcription",
    role: "transcription",
    surface: "fixed",
  },
];

/** Purpose → role: which binding a purpose resolves through. */
export const PURPOSE_TO_ROLE: Readonly<Record<string, string>> = {
  chat: "model.medium",
  classifier: "classifier",
  fast_text: "fast_text",
};

export interface ModelBinding {
  gateway: string;
  modelId: string;
  role: string;
}

/** Bindings indexed by role, as the resolver consumes them. */
export type ModelBindings = ReadonlyMap<string, ModelBinding>;

export function bindingsFromList(list: readonly ModelBinding[]): ModelBindings {
  return new Map(list.map((b) => [b.role, b]));
}

/** The seed set, used to populate an empty binding table at boot. */
export function seedBindings(
  roles: readonly AiRoleSpec[] = AI_PLATFORM_ROLES,
  readEnv?: (key: string) => string | undefined,
  gateway?: string | null
): ModelBinding[] {
  const pack = bindingPackFor(
    gateway ??
      (readEnv ? seedGatewayFromEnv(readEnv) : null) ??
      DEFAULT_MODEL_GATEWAY_ID
  );
  return roles.map((spec) => {
    // A pack value may name its own gateway (`vercel:openai/…`) for a job the
    // pack's gateway cannot do, e.g. embeddings on an Anthropic install.
    const packed = pack.roles[spec.role];
    const ref = packed ? parseModelRef(packed) : null;
    if (ref && ref.modelId !== packed?.trim()) {
      return { gateway: ref.gateway, modelId: ref.modelId, role: spec.role };
    }
    const modelId = packed ?? spec.defaultModelId;
    return { gateway: pack.gateway, modelId, role: spec.role };
  });
}

/**
 * Merge module-declared roles into the platform set for seeding.
 *
 * A module may not redefine a platform role — if `coder` shipped a
 * `classifier` role it would silently retarget every classification call. First
 * declaration wins for module-vs-module collisions, which is arbitrary but
 * deterministic; the binding console surfaces `declaredBy` so a collision is
 * visible rather than mysterious.
 */
export function mergeDeclaredRoles(
  declared: readonly {
    default_model_id: string;
    label: string;
    module_id: string;
    role: string;
  }[],
  platform: readonly AiRoleSpec[] = AI_PLATFORM_ROLES
): AiRoleSpec[] {
  const seen = new Set(platform.map((spec) => spec.role));
  const merged = [...platform];
  for (const entry of declared) {
    if (seen.has(entry.role)) {
      continue;
    }
    seen.add(entry.role);
    merged.push({
      declaredBy: entry.module_id,
      defaultModelId: entry.default_model_id,
      label: entry.label,
      role: entry.role,
      surface: "fixed",
    });
  }
  return merged;
}
