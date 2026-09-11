import type { KbRepoFactory } from "../../src/dal/contracts.js";
import type { KnowledgeBase } from "../../src/schema/types.js";
import { kbLinksFor } from "./kb-ai-gateway-shared.js";

type KbRepos = KbRepoFactory;

/**
 * Resolve one KB for list/create operations.
 *
 * An explicit `kb_id` wins, provided it belongs to the run's Space. Without
 * one, a Space-bound run resolves to the Space's one knowledge base. An
 * unbound run (no Space) sees the whole tenant; several libraries there and
 * no `kb_id` resolve to `null`, and the caller answers with
 * `kbTargetRequired`, which lists the candidates, instead of silently taking
 * the first row.
 */
export async function resolveKbIdForScopedRead(
  repos: KbRepos,
  explicitKbId?: string,
  spaceId?: string
): Promise<string | null> {
  const scopedSpaceId = spaceId?.trim();
  if (explicitKbId?.trim()) {
    const kb = await repos.kb.getById(explicitKbId.trim());
    if (!kb) {
      return null;
    }
    if (scopedSpaceId && kb.space_id !== scopedSpaceId) {
      return null;
    }
    return kb.id;
  }
  const kbs = await listKbsInScope(repos, scopedSpaceId);
  return kbs.length === 1 && kbs[0] ? kbs[0].id : null;
}

function listKbsInScope(
  repos: KbRepos,
  spaceId: string | undefined
): Promise<KnowledgeBase[]> {
  return repos.kb.list(spaceId ? { spaceId } : undefined);
}

export interface KbTargetRequiredResult {
  error: "kb_id_required" | "kb_not_found" | "no_knowledge_bases";
  knowledge_bases: { id: string; link?: string; name: string; slug: string }[];
  message: string;
}

/**
 * The operation result when no single KB could be resolved. Carries the
 * candidates (with their in-app links) so the model can name one on the next
 * call rather than guess.
 */
export async function kbTargetRequired(
  repos: KbRepos,
  spaceId: string | undefined,
  explicitKbId?: string
): Promise<KbTargetRequiredResult> {
  const kbs = await listKbsInScope(repos, spaceId?.trim() || undefined);
  const knowledge_bases = await Promise.all(
    kbs.map(async (kb) => ({
      id: kb.id,
      link: (await kbLinksFor(repos, kb))?.hub(),
      name: kb.name,
      slug: kb.slug,
    }))
  );
  if (explicitKbId?.trim()) {
    return {
      error: "kb_not_found",
      knowledge_bases,
      message: `Knowledge base ${explicitKbId.trim()} does not exist in this Space. Pick one of the listed knowledge_bases.`,
    };
  }
  if (knowledge_bases.length === 0) {
    return {
      error: "no_knowledge_bases",
      knowledge_bases,
      message: spaceId
        ? "This Space has no knowledge base. Mount the Knowledge Base module here — space_setup action='add' modules=[{id:'knowledge-base'}] — and it is created with the mount."
        : "No knowledge base exists yet. Mount the Knowledge Base module in a space (space_setup action='add') — it is created with the mount.",
    };
  }
  return {
    error: "kb_id_required",
    knowledge_bases,
    message: `${knowledge_bases.length} knowledge bases are in reach (one per space). Pass kb_id for the one you mean.`,
  };
}
