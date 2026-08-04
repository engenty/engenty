import { ArticleEditView } from "../components/article-edit/article-edit-view.js";
import { useArticleEditState } from "../hooks/use-article-edit-state.js";
import { useKbArticleEditAgentUiSlice } from "../hooks/use-kb-agent-ui-slice.js";

export function ArticleEditPage() {
  const state = useArticleEditState();
  useKbArticleEditAgentUiSlice({
    entityId: state.isNew ? undefined : (state.article?.id ?? state.id),
    isNew: state.isNew,
    status: state.status,
    title: state.title,
  });
  return <ArticleEditView state={state} />;
}
