import type { KbRepoFactory } from "../../src/dal/contracts.js";

type KbRepos = KbRepoFactory;

/** Resolve one KB for list/create operations (matches UI: default, else first). */
export async function resolveKbIdForScopedRead(
  repos: KbRepos,
  explicitKbId?: string
): Promise<string | null> {
  if (explicitKbId?.trim()) {
    const kb = await repos.kb.getById(explicitKbId.trim());
    return kb?.id ?? null;
  }
  const defaultKb = await repos.kb.getDefault();
  if (defaultKb) {
    return defaultKb.id;
  }
  const kbs = await repos.kb.list();
  return kbs[0]?.id ?? null;
}
