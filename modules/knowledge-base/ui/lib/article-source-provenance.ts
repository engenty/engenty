import type { Article, SourceReference } from "../../src/schema/types.js";

export interface ArticleSourceProvenance {
  kbSourceId: string | null;
  kbSourceName: string | null;
  oneToOne: boolean;
  sourceUrl: string | null;
}

function isExternalUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

/** Compact label for header toplines (hostname + path, truncated). */
export function formatArticleSourceDisplayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    const host = parsed.hostname.replace(/^www\./, "");
    const combined = `${host}${path}${parsed.search}`;
    if (combined.length <= 72) {
      return combined;
    }
    return `${combined.slice(0, 69)}…`;
  } catch {
    const trimmed = url.trim();
    return trimmed.length > 72 ? `${trimmed.slice(0, 69)}…` : trimmed;
  }
}

function visibleSourceReferences(refs: SourceReference[]): SourceReference[] {
  return refs.filter(
    (ref) => ref.inbox_item_id || ref.source_url?.trim() || ref.excerpt?.trim()
  );
}

function fromApiDataSource(
  article: Pick<Article, "kb_data_source"> | null | undefined
): ArticleSourceProvenance | null {
  const link = article?.kb_data_source;
  if (!link?.id?.trim()) {
    return null;
  }
  return {
    kbSourceId: link.id,
    kbSourceName: link.name?.trim() || null,
    oneToOne: link.one_to_one,
    sourceUrl: link.source_url?.trim() || null,
  };
}

/** Whether an article was promoted from inbox or ingested from an external source URL. */
export function resolveArticleSourceProvenance(
  article:
    | Pick<Article, "original_document_url" | "kb_data_source">
    | null
    | undefined,
  refs: SourceReference[]
): ArticleSourceProvenance | null {
  const fromApi = fromApiDataSource(article);
  if (fromApi) {
    return fromApi;
  }

  const visible = visibleSourceReferences(refs);
  const primary = visible[0];
  const sourceUrl =
    primary?.source_url?.trim() ||
    (article?.original_document_url?.trim() &&
    isExternalUrl(article.original_document_url)
      ? article.original_document_url.trim()
      : null);

  if (!(sourceUrl || primary?.inbox_item_id || primary?.excerpt?.trim())) {
    return null;
  }

  return {
    kbSourceId: null,
    kbSourceName: null,
    oneToOne: false,
    sourceUrl,
  };
}
