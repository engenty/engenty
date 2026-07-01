import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@engenty/ui-core";
import type { Article } from "../../src/schema/types.js";
import type { CategoryWithPath } from "../lib/category-display-paths.js";

interface SourceAgenticIngestPanelProps {
  articles: Article[];
  categoryId: string;
  decoratedCategories: CategoryWithPath[];
  instructions: string;
  onCategoryChange: (value: string) => void;
  onSave: () => void;
  parentArticleId: string;
  savePending: boolean;
  setInstructions: (value: string) => void;
  setParentArticleId: (value: string) => void;
  updatePending: boolean;
}

export function SourceAgenticIngestPanel({
  articles,
  categoryId,
  decoratedCategories,
  instructions,
  onCategoryChange,
  onSave,
  parentArticleId,
  savePending,
  setInstructions,
  setParentArticleId,
  updatePending,
}: SourceAgenticIngestPanelProps) {
  const { t } = useTranslation("kb");
  const defaultCategory = decoratedCategories.find(
    (category) => category.is_default
  );
  const categoryValue =
    categoryId && categoryId !== defaultCategory?.id
      ? categoryId
      : "__default__";
  const selectedCategory =
    categoryId && decoratedCategories.length > 0
      ? (decoratedCategories.find((category) => category.id === categoryId) ??
        null)
      : null;
  const showUnknownSelectedCategory = Boolean(
    categoryValue !== "__default__" && !selectedCategory
  );

  return (
    <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
      <div className="space-y-1">
        <label className="font-medium text-sm" htmlFor="ingest-agentic">
          {t("sources.ingest_agentic_instructions_label")}
        </label>
        <p className="text-muted-foreground text-xs">
          {t("sources.ingest_agentic_instructions_desc")}
        </p>
        <Textarea
          className="min-h-[180px] resize-y text-sm"
          id="ingest-agentic"
          onChange={(event) => setInstructions(event.target.value)}
          placeholder={t("sources.ingest_agentic_instructions_placeholder")}
          value={instructions}
        />
      </div>

      <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="font-medium text-sm" htmlFor="ingest-category">
            {t("sources.ingest_category_label")}
          </label>
          <p className="text-muted-foreground text-xs">
            {t("sources.ingest_agentic_category_desc")}
          </p>
          <Select
            disabled={updatePending}
            onValueChange={(value) =>
              onCategoryChange(value === "__default__" ? "" : value)
            }
            value={categoryValue}
          >
            <SelectTrigger className="h-8 text-sm" id="ingest-category">
              <SelectValue
                placeholder={t("sources.ingest_category_placeholder")}
              >
                {categoryValue === "__default__"
                  ? t("sources.ingest_category_default")
                  : (decoratedCategories.find((c) => c.id === categoryValue)
                      ?.display_path ?? t("sources.ingest_category_selected"))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__">
                {t("sources.ingest_category_default")}
              </SelectItem>
              {showUnknownSelectedCategory ? (
                <SelectItem value={categoryId}>
                  {t("sources.ingest_category_selected")}
                </SelectItem>
              ) : null}
              {decoratedCategories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.display_path}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label
            className="font-medium text-sm"
            htmlFor="ingest-parent-article"
          >
            {t("sources.ingest_parent_article_label")}
          </label>
          <p className="text-muted-foreground text-xs">
            {t("sources.ingest_agentic_parent_desc")}
          </p>
          <Select
            onValueChange={(value) =>
              setParentArticleId(value === "__none__" ? "" : value)
            }
            value={parentArticleId || "__none__"}
          >
            <SelectTrigger className="h-8 text-sm" id="ingest-parent-article">
              <SelectValue
                placeholder={t("sources.ingest_parent_article_placeholder")}
              >
                {parentArticleId
                  ? (articles.find((a) => a.id === parentArticleId)?.title ??
                    t("sources.ingest_parent_article_placeholder"))
                  : t("sources.ingest_parent_article_none")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">
                {t("sources.ingest_parent_article_none")}
              </SelectItem>
              {articles.map((article) => (
                <SelectItem key={article.id} value={article.id}>
                  {article.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          disabled={savePending}
          onClick={onSave}
          size="sm"
          type="button"
          variant="outline"
        >
          {savePending
            ? t("sources.ingest_agentic_saving")
            : t("sources.ingest_agentic_save")}
        </Button>
      </div>
    </div>
  );
}
