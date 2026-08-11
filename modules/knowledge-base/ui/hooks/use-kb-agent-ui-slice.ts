import {
  buildAgentUiPageBrief,
  useRegisterAgentUiSlice,
} from "@engenty/app-shell";
import { useMemo } from "react";

/** Type alias (not interface) so it satisfies `JsonValue` via implicit index signature. */
// biome-ignore lint/style/useConsistentTypeDefinitions: type alias required for JsonValue index signature
type KbListPreviewItem = {
  id: string;
  label: string;
  status?: string;
};

function articleLabel(item: { id: string; title?: string | null }) {
  return item.title?.trim() || item.id;
}

export function useKbArticlesListAgentUiSlice(input: {
  articles: Array<{ id: string; status?: string; title?: string | null }>;
  search: string;
  total: number;
}) {
  const slice = useMemo(() => {
    const q = input.search.trim();
    const preview: KbListPreviewItem[] = input.articles
      .slice(0, 10)
      .map((a) => ({
        id: a.id,
        label: articleLabel(a),
        ...(a.status ? { status: a.status } : {}),
      }));
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "list",
          page_title: "Articles",
          page_description: q
            ? `Knowledge-base articles list filtered by search (${input.total} total).`
            : `Knowledge-base articles list (${input.total} total).`,
          list_search: q,
          list_total: input.total,
          list_preview: preview,
        }),
      },
    };
  }, [input.articles, input.search, input.total]);

  useRegisterAgentUiSlice("kb.articles", slice);
}

export function useKbArticleDetailAgentUiSlice(
  article: {
    id: string;
    status?: string;
    title?: string | null;
  } | null
) {
  const slice = useMemo(() => {
    if (!article) {
      return null;
    }
    const title = articleLabel(article);
    const status = article.status?.trim();
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "detail",
          page_title: title,
          page_description: status
            ? `Viewing knowledge-base article ${title} (status ${status}).`
            : `Viewing knowledge-base article ${title}.`,
        }),
        entity_title: title,
        ...(status ? { article_status: status } : {}),
      },
      selection: {
        entity_id: article.id,
        entity_type: "kb_article",
      },
    };
  }, [article]);

  useRegisterAgentUiSlice("kb.article-detail", slice);
}

export function useKbArticleEditAgentUiSlice(input: {
  entityId: string | undefined;
  isNew: boolean;
  status: string;
  title: string;
}) {
  const slice = useMemo(() => {
    const title =
      input.title.trim() || (input.isNew ? "New article" : "Article");
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "edit",
          page_title: title,
          page_description: input.isNew
            ? `Creating knowledge-base article ${title}.`
            : `Editing knowledge-base article ${title} (status ${input.status}).`,
        }),
        entity_title: title,
        article_status: input.status,
      },
      selection: input.entityId
        ? {
            entity_id: input.entityId,
            entity_type: "kb_article",
          }
        : undefined,
    };
  }, [input.entityId, input.isNew, input.status, input.title]);

  useRegisterAgentUiSlice("kb.article-edit", slice);
}
