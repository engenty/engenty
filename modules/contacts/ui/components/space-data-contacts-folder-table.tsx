import { useTranslation } from "@engenty/i18n/ui";
import {
  adminListCardsGridClassName,
  cn,
  STICKY_HEADER_CLASS,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  type TableSize,
  TableSortableHeader,
  uiCardRaisedClassName,
  type ViewMode,
} from "@engenty/ui-core";
import { Link } from "react-router-dom";
import type { ContactsFolderColumn } from "./space-data-contacts-folder-toolbar.js";

export interface ContactsFolderRow {
  email: string;
  href: string;
  id: string;
  name: string;
}

export function ContactsFolderListTable({
  columnOrder,
  columnVisibility,
  onSortChange,
  rows,
  sortBy,
  sortOrder,
  tableSize,
  viewMode,
}: {
  columnOrder: ContactsFolderColumn[];
  columnVisibility: Record<ContactsFolderColumn, boolean>;
  onSortChange: (column: ContactsFolderColumn) => void;
  rows: ContactsFolderRow[];
  sortBy: ContactsFolderColumn;
  sortOrder: "asc" | "desc";
  tableSize: TableSize;
  viewMode: ViewMode;
}) {
  const { t } = useTranslation("contacts");
  const compact = tableSize === "compact";
  const labels: Record<ContactsFolderColumn, string> = {
    email: t("email"),
    name: t("displayName"),
  };

  if (viewMode === "cards") {
    return (
      <div className={adminListCardsGridClassName(tableSize)}>
        {rows.map((row) => (
          <Link
            className={cn(
              uiCardRaisedClassName,
              "group flex flex-col gap-1",
              compact ? "p-3" : "p-4"
            )}
            key={row.id}
            to={row.href}
          >
            <span className="truncate font-medium text-sm group-hover:underline">
              {row.name}
            </span>
            {row.email ? (
              <span className="truncate text-muted-foreground text-sm">
                {row.email}
              </span>
            ) : null}
          </Link>
        ))}
      </div>
    );
  }

  return (
    <Table noWrapper>
      <TableHeader className={STICKY_HEADER_CLASS}>
        <TableRow
          className={cn(
            "group border-b-0 hover:bg-transparent",
            compact ? "[&>th]:!py-1.5" : "[&>th]:!py-3"
          )}
        >
          {columnOrder.map((key) =>
            columnVisibility[key] ? (
              <TableSortableHeader<ContactsFolderColumn>
                column={key}
                compact={compact}
                key={key}
                onSort={onSortChange}
                sortBy={sortBy}
                sortOrder={sortOrder}
              >
                {labels[key]}
              </TableSortableHeader>
            ) : null
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow
            className={cn("group", compact ? "[&>td]:!py-1.5" : "[&>td]:!py-3")}
            key={row.id}
          >
            {columnOrder.map((key) => {
              if (!columnVisibility[key]) {
                return null;
              }
              if (key === "name") {
                return (
                  <TableCell className="max-w-0" key={key}>
                    <Link className="block truncate font-medium" to={row.href}>
                      {row.name}
                    </Link>
                  </TableCell>
                );
              }
              return (
                <TableCell className="text-muted-foreground text-sm" key={key}>
                  {row.email || "—"}
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
