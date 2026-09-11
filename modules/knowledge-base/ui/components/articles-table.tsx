import { useTranslation } from "@engenty/i18n/ui";
import { useQueryClient } from "@engenty/query-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  DropdownMenuItem,
  STICKY_HEADER_CLASS,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowActions,
  TableSelectionCell,
  TableSelectionHeader,
  TableSortableHeader,
} from "@engenty/ui-core";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { Article } from "../../src/schema/types.js";
import { deleteArticle } from "../api.js";
import { kbArticlePath } from "../kb-paths.js";
import { articleStatusPillClassName } from "../lib/article-status-pill.js";
import { invalidateKbGraphQueries } from "../queries.js";
import type {
  ArticlesColumnVisibility,
  ArticlesSortColumn,
} from "./articles-table-toolbar.js";

const COLUMN_TO_SORT: Partial<
  Record<keyof ArticlesColumnVisibility, ArticlesSortColumn>
> = {
  title: "title",
  status: "status",
  sortOrder: "sort_order",
  createdAt: "created_at",
  updatedAt: "updated_at",
};

type TableSize = "compact" | "normal";

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

interface ArticlesTableProps {
  articles: Article[];
  columnOrder: (keyof ArticlesColumnVisibility)[];
  columnVisibility: ArticlesColumnVisibility;
  onDataChange: () => void;
  onRowClick: (article: Article) => void;
  onSelectAll: (checked: boolean | "indeterminate") => void;
  onSelectOne: (id: string, checked: boolean) => void;
  onSortChange: (column: ArticlesSortColumn) => void;
  selectedIds: Set<string>;
  sortBy: ArticlesSortColumn;
  sortOrder: "asc" | "desc";
  tableSize: TableSize;
}

export function ArticlesTable({
  articles,
  columnVisibility,
  columnOrder,
  sortBy,
  sortOrder,
  tableSize,
  selectedIds,
  onSortChange,
  onSelectAll,
  onSelectOne,
  onRowClick,
  onDataChange,
}: ArticlesTableProps) {
  const { t } = useTranslation("kb");
  const queryClient = useQueryClient();

  const allSelected =
    articles.length > 0 && selectedIds.size === articles.length;
  const someSelected =
    selectedIds.size > 0 && selectedIds.size < articles.length;

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDeleteOne = async (id: string) => {
    setDeletingId(id);
    const kbId = articles.find((a) => a.id === id)?.kb_id;
    try {
      await deleteArticle(id);
      void invalidateKbGraphQueries(queryClient, kbId);
      onDataChange();
    } finally {
      setDeletingId(null);
    }
  };

  const labels: Record<keyof ArticlesColumnVisibility, string> = {
    title: t("columns.title"),
    slug: t("columns.slug"),
    status: t("columns.status"),
    tags: t("columns.tags"),
    sortOrder: t("columns.sort_order"),
    createdAt: t("columns.created_at"),
    updatedAt: t("columns.updated_at"),
  };

  const compact = tableSize === "compact";

  function cellContent(key: keyof ArticlesColumnVisibility, article: Article) {
    switch (key) {
      case "title":
        return article.title;
      case "slug":
        return article.slug;
      case "status":
        return article.status;
      case "tags":
        return (article.tags ?? []).map((x) => x.name).join(", ") || "—";
      case "sortOrder":
        return String(article.sort_order);
      case "createdAt":
        return formatDate(article.created_at);
      case "updatedAt":
        return formatDate(article.updated_at);
      default:
        return "—";
    }
  }

  return (
    <>
      <Table noWrapper>
        <TableHeader className={STICKY_HEADER_CLASS}>
          <TableRow
            className={`group border-b-0 hover:bg-transparent ${compact ? "[&>th]:!py-1.5" : "[&>th]:!py-3"}`}
          >
            <TableSelectionHeader
              aria-label={t("list.select_all")}
              checked={
                someSelected && !allSelected ? "indeterminate" : allSelected
              }
              compact={compact}
              onCheckedChange={onSelectAll}
            />
            {columnOrder.map((key) => {
              if (!columnVisibility[key]) {
                return null;
              }
              const sortColumn = COLUMN_TO_SORT[key];
              if (sortColumn) {
                return (
                  <TableSortableHeader<ArticlesSortColumn>
                    column={sortColumn}
                    compact={compact}
                    key={key}
                    onSort={onSortChange}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                  >
                    {labels[key]}
                  </TableSortableHeader>
                );
              }
              return (
                <TableHead className={compact ? "!py-1.5" : ""} key={key}>
                  {labels[key]}
                </TableHead>
              );
            })}
            <TableCell
              className={`w-[40px] px-1 ${compact ? "!py-1.5" : ""}`}
            />
          </TableRow>
        </TableHeader>
        <TableBody className="[--ui-canvas-row-divider-w:0px]">
          {articles.map((article) => (
            <TableRow
              className={`group cursor-pointer ${compact ? "[&>td]:!py-1.5" : "[&>td]:!py-3"}`}
              data-state={selectedIds.has(article.id) ? "selected" : undefined}
              key={article.id}
              onClick={() => onRowClick(article)}
            >
              <TableSelectionCell
                checked={selectedIds.has(article.id)}
                compact={compact}
                hoverReveal
                id={article.id}
                onCheckedChange={onSelectOne}
              />
              {columnOrder.map((key) => {
                if (!columnVisibility[key]) {
                  return null;
                }
                const value = cellContent(key, article);
                return (
                  <TableCell
                    className={key === "title" ? "font-medium" : ""}
                    key={key}
                  >
                    {key === "status" ? (
                      <span
                        className={articleStatusPillClassName(article.status)}
                      >
                        {t(`article.status.${article.status}`)}
                      </span>
                    ) : key === "title" ? (
                      // The row stays clickable; the title is a real link so the
                      // shell can prefetch the article on hover and the reader
                      // can open it in a new tab.
                      <Link
                        onClick={(e) => e.stopPropagation()}
                        to={kbArticlePath(article.slug || article.id)}
                      >
                        {value}
                      </Link>
                    ) : (
                      value
                    )}
                  </TableCell>
                );
              })}
              <TableRowActions compact={compact}>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeletingId(article.id);
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t("article.actions.delete")}
                </DropdownMenuItem>
              </TableRowActions>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AlertDialog
        onOpenChange={(open) => !open && setDeletingId(null)}
        open={deletingId !== null}
      >
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("list.delete_article_confirm")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("actions.confirm_delete_desc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!deletingId}
              onClick={() => {
                if (deletingId) {
                  handleDeleteOne(deletingId);
                }
              }}
            >
              {t("article.actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
