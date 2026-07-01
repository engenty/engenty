import { ArticleEditView } from "../components/article-edit/article-edit-view.js";
import { useArticleEditState } from "../hooks/use-article-edit-state.js";

export function ArticleEditPage() {
  const state = useArticleEditState();
  return <ArticleEditView state={state} />;
}
