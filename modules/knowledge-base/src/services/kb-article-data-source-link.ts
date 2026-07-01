import type { KbRepoFactory } from "../dal/contracts.js";
import type {
  Article,
  KbArticleDataSourceLink,
  SourceReference,
} from "../schema/types.js";

function isExternalUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function visibleSourceReferences(refs: SourceReference[]): SourceReference[] {
  return refs.filter(
    (ref) => ref.inbox_item_id || ref.source_url?.trim() || ref.excerpt?.trim()
  );
}

async function loadSourceName(
  repos: KbRepoFactory,
  sourceId: string
): Promise<string | null> {
  const source = await repos.sources.getById(sourceId);
  return source?.name?.trim() || null;
}

async function linkFromSourceItem(
  repos: KbRepoFactory,
  sourceId: string,
  sourceUrl: string | null,
  oneToOne: boolean
): Promise<KbArticleDataSourceLink | null> {
  const name = await loadSourceName(repos, sourceId);
  if (!name) {
    return null;
  }
  return {
    id: sourceId,
    name,
    one_to_one: oneToOne,
    source_url: sourceUrl,
  };
}

/** Resolve KB Sources admin link for an article (inbox link or ingested item URL). */
export async function resolveKbArticleDataSourceLink(
  repos: KbRepoFactory,
  article: Pick<Article, "kb_id" | "original_document_url">,
  sourceReferences: SourceReference[]
): Promise<KbArticleDataSourceLink | null> {
  const primary = visibleSourceReferences(sourceReferences)[0];

  const candidateUrls = [
    primary?.source_url?.trim(),
    article.original_document_url?.trim(),
  ].filter((value): value is string => Boolean(value && isExternalUrl(value)));

  for (const url of candidateUrls) {
    const item = await repos.sources.findSourceItemBySourceUrl(
      article.kb_id,
      url
    );
    if (item) {
      return linkFromSourceItem(repos, item.source_id, url, true);
    }
  }

  if (primary?.inbox_item_id) {
    const item = await repos.sources.findSourceItemByInboxItemId(
      primary.inbox_item_id
    );
    if (item) {
      return linkFromSourceItem(
        repos,
        item.source_id,
        primary.source_url?.trim() || item.source_url,
        true
      );
    }

    const inbox = await repos.inbox.getById(primary.inbox_item_id);
    if (inbox?.linked_kb_source_id) {
      return linkFromSourceItem(
        repos,
        inbox.linked_kb_source_id,
        primary.source_url?.trim() || inbox.source_url,
        false
      );
    }
  }

  return null;
}
