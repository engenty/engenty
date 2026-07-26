/**
 * The single definition of "is this model legal for this tenant".
 *
 * Three call sites used to answer this question independently with a raw
 * `Array.includes` on untrimmed strings — the picker filter, the purpose
 * resolver, and the usage preflight. They agreed by luck, and none of them
 * tolerated so much as a stray space. This module is the one implementation
 * they now share, so a model can never be legal to run but invisible to pick.
 */

/** A tenant's grants. Both lists: null or empty = unrestricted. */
export interface ModelAllowList {
  allowed_models?: readonly string[] | null;
  allowed_providers?: readonly string[] | null;
}

/**
 * Comparison form for a model id or provider slug: trimmed and lowercased.
 *
 * Deliberately does NOT strip path segments. Gateway catalog ids are always
 * `provider/model`, but routing-prefixed ids (`openrouter/openai/…`) exist in
 * the purpose defaults, and stripping a prefix would silently equate two
 * different routes to the same weights with different billing.
 */
export function canonicalModelId(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Provider slug for a model id: the leading segment. For a routing-prefixed id
 * this is the router (`openrouter`), which is the correct answer — that is who
 * serves and bills the request.
 *
 * Prefer the catalog's own `provider` column when you have the record; this is
 * the fallback for the resolver, which sees only an id string.
 */
export function providerOfModelId(modelId: string): string {
  const canonical = canonicalModelId(modelId);
  const slash = canonical.indexOf("/");
  return slash === -1 ? canonical : canonical.slice(0, slash);
}

function normalizeList(
  list: readonly string[] | null | undefined
): Set<string> | null {
  if (!list || list.length === 0) {
    return null;
  }
  const set = new Set(list.map(canonicalModelId).filter((v) => v.length > 0));
  return set.size > 0 ? set : null;
}

/** True when the policy places no restriction at all. */
export function isUnrestricted(policy: ModelAllowList): boolean {
  return (
    normalizeList(policy.allowed_models) === null &&
    normalizeList(policy.allowed_providers) === null
  );
}

/**
 * Whether `modelId` is permitted.
 *
 * The two lists are ADDITIVE grants, not intersecting filters: a model passes
 * if it is named in `allowed_models` OR its provider is named in
 * `allowed_providers`. That lets a per-model exception widen a vendor grant
 * without restating the vendor's whole catalog.
 *
 * Pass `provider` when the caller holds the catalog record — it is authoritative;
 * otherwise the provider is derived from the id.
 */
export function isModelAllowed(
  modelId: string,
  policy: ModelAllowList,
  provider?: string | null
): boolean {
  const models = normalizeList(policy.allowed_models);
  const providers = normalizeList(policy.allowed_providers);
  if (models === null && providers === null) {
    return true;
  }
  const id = canonicalModelId(modelId);
  if (id.length === 0) {
    return false;
  }
  if (models?.has(id)) {
    return true;
  }
  const slug = provider ? canonicalModelId(provider) : providerOfModelId(id);
  return providers?.has(slug) ?? false;
}

/**
 * The fallback model for a tenant whose every resolution layer is disallowed.
 *
 * Returning *something legal* is what keeps a narrow allow-list from bricking
 * the tenant: the resolver used to hand back the platform default unchecked and
 * the preflight then rejected it, so every turn 429'd with no way out from the
 * UI.
 *
 * Returns null for a provider-only grant — there is no id to name without a
 * catalog lookup, which the pure resolver cannot do. That case has to be caught
 * at the write boundary instead, by refusing a policy that grants no model for
 * a required purpose.
 */
export function firstAllowedModelId(policy: ModelAllowList): string | null {
  const models = policy.allowed_models;
  if (!models) {
    return null;
  }
  for (const candidate of models) {
    const id = candidate.trim();
    if (id.length > 0) {
      return id;
    }
  }
  return null;
}
