// Validates primary_assignee_agent_type_key against the live AI registry.
// Results are cached per base URL for 60 s to avoid one fetch per task create.

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  expiresAt: number;
  ids: Set<string>;
}

const cache = new Map<string, CacheEntry>();

export async function fetchRegisteredAgentIds(
  aiBaseUrl: string,
  aiServiceJwt: string
): Promise<Set<string>> {
  const now = Date.now();
  const cached = cache.get(aiBaseUrl);
  if (cached && cached.expiresAt > now) {
    return cached.ids;
  }

  let response: Response;
  try {
    response = await fetch(`${aiBaseUrl}/ai/registry/agents`, {
      headers: { Authorization: `Bearer ${aiServiceJwt}` },
    });
  } catch {
    throw new Error("agent_registry_unreachable");
  }

  if (!response.ok) {
    throw new Error("agent_registry_unreachable");
  }

  let body: { agents: Array<{ id: string }> };
  try {
    body = (await response.json()) as { agents: Array<{ id: string }> };
  } catch {
    throw new Error("agent_registry_unreachable");
  }

  const ids = new Set(body.agents.map((a) => a.id));
  cache.set(aiBaseUrl, { ids, expiresAt: now + CACHE_TTL_MS });
  return ids;
}

/** Exposed for tests to reset cache state between cases. */
export function clearAgentKeyValidatorCache(): void {
  cache.clear();
}
