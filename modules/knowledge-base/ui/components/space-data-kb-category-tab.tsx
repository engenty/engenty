/**
 * One category, contributed to the space Data pane.
 *
 * This is the folder the whole phase started from — *"similar to knowledge
 * base → like the knowledge base category pages"*. Sub-categories and parent
 * articles first, then the pages; a page that HAS sub-pages reads as a folder
 * because that is what the adapter made it — a parent article is a virtual
 * folder holding its own text and its children.
 *
 * The rows are JOINED, not chosen. The host's listing is the only place a
 * node's tree path exists, and it carries each article's title — so the row is
 * both addressable and readable the moment it renders. Status and summary come
 * from the module's own API, matched on `recordId`, and arrive a beat later;
 * the row never waits on them.
 *
 * What is NOT done here is recovering a title from the file name: an entry is
 * named `onboarding__<id>.article.md`, and un-slugifying that back would lose
 * every capital and every umlaut.
 */
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  cn,
  Spinner,
  uiCardElevatedClassName,
  uiRowHoverClassName,
} from "@engenty/ui-core";
import type { UiTabRenderProps } from "@engenty/ui-plugin-sdk";
import { ChevronRight, FileText, FolderOpen } from "lucide-react";
import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { listArticles } from "../api/articles.js";
import {
  entryRows,
  folderHref,
  folderRows,
  nodeHref,
  type SpaceDataEntryRow,
  type SpaceDataFolderRow,
} from "../lib/space-data-rows.js";

/** The adapter puts each record's id in its own path segment. */
function idOfSegment(path: string): string {
  const segment = path.split("/").at(-1) ?? "";
  const index = segment.lastIndexOf("__");
  return index === -1 ? "" : segment.slice(index + 2);
}

/** The category's own id and the library it belongs to, from the folder path. */
function idsOfCategoryPath(path: string): { categoryId: string; kbId: string } {
  const segments = path.split("/");
  return {
    categoryId: idOfSegment(path),
    kbId: idOfSegment(segments[0] ?? ""),
  };
}

function updatedLabel(value: string | undefined, locale: string): string {
  if (!value) {
    return "";
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? ""
    : parsed.toLocaleDateString(locale, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

export function SpaceDataKbCategoryTab({ params }: UiTabRenderProps) {
  const { i18n, t } = useTranslation("kb");
  const { spaceKey = "" } = useParams();
  const folders = useMemo(() => folderRows(params.folders), [params.folders]);
  const entries = useMemo(() => entryRows(params.entries), [params.entries]);
  const folderPath =
    typeof params.folderPath === "string" ? params.folderPath : "";
  const { categoryId, kbId } = useMemo(
    () => idsOfCategoryPath(folderPath),
    [folderPath]
  );

  const query = useQuery({
    enabled: Boolean(kbId && categoryId && entries.length > 0),
    queryFn: ({ signal }) =>
      listArticles(
        { category_id: categoryId, kb_id: kbId, page: 1, page_size: 200 },
        signal
      ),
    queryKey: ["kb", "space-data", "category-articles", kbId, categoryId],
  });

  const byId = useMemo(
    () => new Map((query.data?.data ?? []).map((row) => [row.id, row])),
    [query.data]
  );

  if (params.isPending === true) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Spinner />
      </div>
    );
  }

  if (folders.length === 0 && entries.length === 0) {
    return (
      <p className="p-6 text-muted-foreground text-sm">
        {t("spaceData.category.empty", {
          defaultValue: "Nothing filed here yet.",
        })}
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
      {folders.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            {t("spaceData.category.folders", { defaultValue: "Folders" })}
          </h2>
          <ul
            className={cn(uiCardElevatedClassName, "divide-y overflow-hidden")}
          >
            {folders.map((folder: SpaceDataFolderRow) => (
              <li key={folder.path}>
                <Link
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 text-sm",
                    uiRowHoverClassName
                  )}
                  to={folderHref(spaceKey, folder.path)}
                >
                  <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{folder.name}</span>
                    {folder.description ? (
                      <span className="truncate text-muted-foreground text-xs">
                        {folder.description}
                      </span>
                    ) : null}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {entries.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            {t("spaceData.category.pages", { defaultValue: "Pages" })}
          </h2>
          <ul
            className={cn(uiCardElevatedClassName, "divide-y overflow-hidden")}
          >
            {entries.map((entry: SpaceDataEntryRow) => {
              const article = byId.get(entry.recordId);
              return (
                <li key={entry.path}>
                  <Link
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 text-sm",
                      uiRowHoverClassName
                    )}
                    to={nodeHref(spaceKey, entry.path)}
                  >
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      {/* The listing's own title first: it is already correct
                          and already here, so the row never flashes a file name
                          while the enrichment loads. */}
                      <span className="truncate">
                        {entry.title || article?.title || entry.name}
                      </span>
                      {article?.summary ? (
                        <span className="truncate text-muted-foreground text-xs">
                          {article.summary}
                        </span>
                      ) : null}
                    </span>
                    {article && article.status !== "published" ? (
                      <span className="shrink-0 rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground uppercase tracking-wide">
                        {t(`status.${article.status}`, {
                          defaultValue: article.status,
                        })}
                      </span>
                    ) : null}
                    <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                      {updatedLabel(entry.updatedAt, i18n.language)}
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {params.truncated === true ? (
        <p className="text-muted-foreground text-xs">
          {t("spaceData.category.truncated", {
            defaultValue:
              "This category holds more pages than one listing shows.",
          })}
        </p>
      ) : null}
    </div>
  );
}
