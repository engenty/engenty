import { canonicalModulePathname } from "@engenty/ai-core/browser";
import type { CopilotAssistantTurnFinishQueryClient } from "@engenty/ui-plugin-sdk";
import { kbArticleKeys } from "./queries.js";

const ARTICLE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves a KB article id from common article view/edit URLs so detail queries
 * refetch after copilot tools mutate articles.
 */
export function extractKbArticleIdFromPathname(
  pathname: string
): string | null {
  // Canonical, not raw: in a space the article is at
  // `/s/<key>/kb/<id>`, and missing it means the open article
  // keeps showing pre-edit content after the copilot changes it.
  const canonical = canonicalModulePathname(pathname);
  const scoped = canonical.match(
    /^\/mdl\/knowledge-base\/[^/]+\/([^/]+)(?:\/edit)?\/?$/i
  );
  if (scoped?.[1] && ARTICLE_UUID.test(scoped[1])) {
    return scoped[1];
  }
  const legacy = canonical.match(
    /^\/mdl\/knowledge-base\/([^/]+)(?:\/edit)?\/?$/i
  );
  if (legacy?.[1] && ARTICLE_UUID.test(legacy[1])) {
    return legacy[1];
  }
  return null;
}

/** After a KB copilot assistant turn, refresh article lists and any open article detail. */
export async function invalidateKbDataAfterCopilotAssistantTurn(
  queryClient: CopilotAssistantTurnFinishQueryClient,
  pathname: string
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: kbArticleKeys.all });
  const articleId = extractKbArticleIdFromPathname(pathname);
  if (articleId) {
    await queryClient.invalidateQueries({
      queryKey: ["kb", "articles", "detail", articleId],
    });
    await queryClient.invalidateQueries({
      queryKey: ["kb", "articles", "versions", articleId],
    });
  }
}
