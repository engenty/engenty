import { useTranslation } from "@engenty/i18n/ui";
import {
  adminListCardsGridClassName,
  Checkbox,
  cn,
  type TableSize,
  uiCardRaisedClassName,
} from "@engenty/ui-core";
import { Link } from "react-router-dom";
import { driveNodeIcon } from "./drive-kind-icon";
import {
  type FolderChildRow,
  formatFolderRowDate,
  isFolderRowSelectable,
} from "./folder-list-model";
import type { FolderListSelection } from "./folder-list-table";

export function FolderListCards({
  rows,
  selection,
  tableSize,
}: {
  rows: FolderChildRow[];
  selection?: FolderListSelection;
  tableSize: TableSize;
}) {
  const { t } = useTranslation("common");
  const compact = tableSize === "compact";
  return (
    <div className={adminListCardsGridClassName(tableSize)}>
      {rows.map((row) => {
        const Icon = driveNodeIcon({
          kind: row.kind,
          ...(row.nodeType ? { nodeType: row.nodeType } : {}),
        });
        const edited = formatFolderRowDate(row.updatedAt);
        const selected = selection?.selectedIds.has(row.id) ?? false;
        const selectable = Boolean(selection && isFolderRowSelectable(row));
        return (
          <div
            className={cn(
              uiCardRaisedClassName,
              "group relative flex flex-col",
              selected && "ui-card-selected"
            )}
            key={row.id}
          >
            {selectable ? (
              <div
                className="absolute top-2 left-2 z-10"
                onClick={(event) => event.stopPropagation()}
              >
                <Checkbox
                  aria-label={t("spaces.data.list.selectRow", {
                    defaultValue: "Select {{name}}",
                    name: row.name,
                  })}
                  checked={selected}
                  className={cn(
                    "transition-opacity",
                    selected
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-100"
                  )}
                  onCheckedChange={(checked) =>
                    selection?.onSelectOne(row.id, checked === true)
                  }
                />
              </div>
            ) : null}
            <Link
              className={cn(
                "flex flex-col gap-1",
                compact ? "p-3" : "p-4",
                selectable ? "pl-9" : null
              )}
              to={row.href}
            >
              <span className="flex min-w-0 items-center gap-2 font-medium text-sm">
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 truncate group-hover:underline">
                  {row.name}
                </span>
              </span>
              {row.subtitle ? (
                <span className="truncate text-muted-foreground text-sm">
                  {row.subtitle}
                </span>
              ) : null}
              <span className="text-muted-foreground text-xs">
                {t(`spaces.data.kind.${row.kind}`, { defaultValue: row.kind })}
                {edited ? ` · ${edited}` : ""}
              </span>
            </Link>
          </div>
        );
      })}
    </div>
  );
}
