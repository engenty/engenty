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
 * - **Fixed** — a specialist job with its own requirements (`router`,
 *   `safeguard`, `ocr`, `embedding`, `rerank`). Never surfaced to end users.
 *
 * Modules may declare their own roles (`coder.plan`, `coder.edit`), which is why
 * a role id is a plain string rather than a closed union: the platform must not
 * need to know what jobs a module invents.
 */

import {
  DEFAULT_AI_CHAT_MODEL_ID,
  DEFAULT_AI_CLASSIFIER_MODEL_ID,
  DEFAULT_AI_PLANNING_CODING_MODEL_ID,
  DEFAULT_AI_SAFEGUARD_MODEL_ID,
} from "./model-defaults.js";

/** How much thinking a piece of work deserves. The only user-facing axis. */
export const AI_EFFORT_LEVELS = ["low", "medium", "high"] as const;
export type AiEffort = (typeof AI_EFFORT_LEVELS)[number];

/**
 * `auto` is not an effort level — it is the absence of a choice, resolved per
 * turn (heuristics first; cheap `router` role only when ambiguous). Kept
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
  /** Seed model id, used when nothing has been bound yet. */
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
 * The graded seeds start deliberately conservative — low and medium share the
 * current chat default rather than guessing at a cheaper model, because a wrong
 * downgrade is invisible until someone notices worse answers. Rebinding is a
 * one-line change in the console; a silent quality regression is not.
 */
export const AI_PLATFORM_ROLES: readonly AiRoleSpec[] = [
  {
    declaredBy: null,
    defaultModelId: DEFAULT_AI_CLASSIFIER_MODEL_ID,
    label: "General · low effort",
    role: "model.low",
    surface: "graded",
  },
  {
    declaredBy: null,
    defaultModelId: DEFAULT_AI_CHAT_MODEL_ID,
    label: "General · medium effort",
    role: "model.medium",
    surface: "graded",
  },
  {
    declaredBy: null,
    defaultModelId: DEFAULT_AI_CHAT_MODEL_ID,
    label: "General · high effort",
    role: "model.high",
    surface: "graded",
  },
  {
    declaredBy: null,
    defaultModelId: DEFAULT_AI_CLASSIFIER_MODEL_ID,
    label: "Router",
    role: "router",
    surface: "fixed",
  },
  {
    declaredBy: null,
    defaultModelId: DEFAULT_AI_CLASSIFIER_MODEL_ID,
    label: "Classifier",
    role: "classifier",
    surface: "fixed",
  },
  {
    declaredBy: null,
    defaultModelId: DEFAULT_AI_SAFEGUARD_MODEL_ID,
    label: "Safeguard",
    role: "safeguard",
    surface: "fixed",
  },
  {
    declaredBy: null,
    defaultModelId: DEFAULT_AI_PLANNING_CODING_MODEL_ID,
    label: "Planning & coding",
    role: "planning_coding",
    surface: "fixed",
  },
  {
    declaredBy: null,
    defaultModelId: DEFAULT_AI_CHAT_MODEL_ID,
    label: "Research",
    role: "research",
    surface: "fixed",
  },
];

/**
 * Legacy purpose → role. The five purposes were already roles in all but name;
 * mapping them keeps every existing caller working while the binding table
 * becomes the source of truth underneath.
 */
export const PURPOSE_TO_ROLE: Readonly<Record<string, string>> = {
  chat: "model.medium",
  routing: "router",
  // Dedicated fixed role — not model.low (graded chat effort is a different job).
  classifier: "classifier",
  research: "research",
  planning_coding: "planning_coding",
  safeguard: "safeguard",
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
  readEnv?: (key: string) => string | undefined
): ModelBinding[] {
  return roles.map((spec) => ({
    // Env vars seeded the platform layer before bindings existed. They are read
    // once, here, so an existing deployment keeps its behaviour on upgrade —
    // and then never again, so there is exactly one place to look afterwards.
    gateway: "vercel",
    modelId: envSeedFor(spec.role, readEnv) ?? spec.defaultModelId,
    role: spec.role,
  }));
}

/**
 * One env var per role — the value that seeds a role's binding when the table
 * is empty. Each role had a second, older key here as a fallback; those were
 * aliases of aliases (a legacy name feeding a renamed role feeding a binding)
 * and are gone, so a role's seed has exactly one source.
 */
const ROLE_ENV_KEYS: Readonly<Record<string, readonly string[]>> = {
  "model.low": ["AI_CLASSIFIER_MODEL"],
  "model.medium": ["AI_CHAT_MODEL"],
  "model.high": ["AI_CHAT_MODEL"],
  router: ["AI_ROUTING_MODEL"],
  classifier: ["AI_CLASSIFIER_MODEL"],
  safeguard: ["AI_SAFEGUARD_MODEL"],
  planning_coding: ["AI_PLANNING_CODING_MODEL"],
  research: ["AI_RESEARCH_MODEL"],
};

function envSeedFor(
  role: string,
  readEnv?: (key: string) => string | undefined
): string | undefined {
  if (!readEnv) {
    return;
  }
  for (const key of ROLE_ENV_KEYS[role] ?? []) {
    const value = readEnv(key)?.trim();
    if (value) {
      return value;
    }
  }
  return;
}

/**
 * Merge module-declared roles into the platform set for seeding.
 *
 * A module may not redefine a platform role — if `coder` shipped a `router`
 * role it would silently retarget every routing call in the product. First
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
