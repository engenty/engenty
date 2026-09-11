/**
 * One knowledge base, contributed to the space Data pane.
 *
 * A library's index is its categories — the same shelves its own sidebar
 * shows. Each carries the number of articles filed directly in it, read from
 * `total` rather than counted from rows, for the reason the root states.
 *
 * Deliberately NOT the KB's hub page with its block layout: the hub is the
 * library's front door and it brings its own navigation, which inside the
 * pane would sit beside the tree the reader used to get here. The link out is
 * one click away and says so.
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
import { ChevronRight, Folder } from "lucide-react";
import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { listArticles } from "../api/articles.js";
import {
  folderHref,
  folderRows,
  type SpaceDataFolderRow,
} from "../lib/space-data-rows.js";

function idOfSegment(path: string): string {
  const segment = path.split("/").at(-1) ?? "";
  const index = segment.lastIndexOf("__");
  return index === -1 ? "" : segment.slice(index + 2);
}

function CategoryCount({
  categoryId,
  kbId,
}: {
  categoryId: string;
  kbId: string;
}) {
  const { t } = useTranslation("kb");
  const query = useQuery({
    enabled: Boolean(kbId && categoryId),
    queryFn: ({ signal }) =>
      listArticles(
        { category_id: categoryId, kb_id: kbId, page: 1, page_size: 1 },
        signal
      ),
    queryKey: ["kb", "space-data", "category-count", kbId, categoryId],
  });
  return (
    <span className="text-muted-foreground text-xs">
      {query.data
        ? t("spaceData.base.articleCount", {
            count: query.data.total,
            defaultValue: "{{count}} articles",
          })
        : "—"}
    </span>
  );
}

export function SpaceDataKbBaseTab({ params }: UiTabRenderProps) {
  const { t } = useTranslation("kb");
  const { spaceKey = "" } = useParams();
  const folders = useMemo(() => folderRows(params.folders), [params.folders]);
  const kbId = useMemo(
    () =>
      typeof params.folderPath === "string"
        ? idOfSegment(params.folderPath)
        : "",
    [params.folderPath]
  );

  if (params.isPending === true) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
      <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {t("spaceData.base.categories", { defaultValue: "Categories" })}
      </h2>
      {folders.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("spaceData.base.empty", {
            defaultValue: "This knowledge base has no categories yet.",
          })}
        </p>
      ) : (
        <ul className={cn(uiCardElevatedClassName, "divide-y overflow-hidden")}>
          {folders.map((folder: SpaceDataFolderRow) => (
            <li key={folder.path}>
              <Link
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 text-sm",
                  uiRowHoverClassName
                )}
                to={folderHref(spaceKey, folder.path)}
              >
                <Folder className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{folder.name}</span>
                  {folder.description ? (
                    <span className="truncate text-muted-foreground text-xs">
                      {folder.description}
                    </span>
                  ) : null}
                </span>
                <CategoryCount
                  categoryId={idOfSegment(folder.path)}
                  kbId={kbId}
                />
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
