/**
 * The `Contacts` root, contributed to the space Data pane.
 *
 * The generic view of this folder is two folder names and a CSV. What an
 * address book's index owes its reader is how many people and how many
 * organisations are actually in it, and a way into the whole thing at once.
 *
 * Counted by asking for ONE row per type and reading `total` off the envelope,
 * not by pulling the rows and measuring the array. The list endpoint caps
 * `pageSize` at 200, so counting client-side would quietly stop being true at
 * the 201st contact — and an address book is exactly the kind of thing that
 * passes 200.
 */
import { useTranslation } from "@engenty/i18n/ui";
import {
  cn,
  Spinner,
  uiCardElevatedClassName,
  uiRowHoverClassName,
  uiStatusCardClassName,
} from "@engenty/ui-core";
import type { UiTabRenderProps } from "@engenty/ui-plugin-sdk";
import { ChevronRight, Table2 } from "lucide-react";
import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import type { ContactType } from "../../src/schema/index.js";
import { useContactsListQuery } from "../queries.js";

/** One row of the host's listing, as much of it as this view reads. */
interface FolderRow {
  name: string;
  path: string;
}

interface EntryRow {
  name: string;
  path: string;
}

function isRow(value: unknown): value is FolderRow {
  if (!value || typeof value !== "object") {
    return false;
  }
  const row = value as Record<string, unknown>;
  return typeof row.name === "string" && typeof row.path === "string";
}

/** `People` → the type that folder filters by. */
function typeOfFolder(name: string): ContactType | null {
  if (name === "People") {
    return "person";
  }
  return name === "Organisations" ? "organisation" : null;
}

/**
 * One type's total.
 *
 * A hook per type rather than a loop, because hooks cannot be called in one:
 * the two folders are fixed by the adapter's taxonomy, so two calls is the
 * honest shape rather than a limitation worked around.
 */
function useContactTypeTotal(type: ContactType) {
  const query = useContactsListQuery({
    include_linked_invoice_counts: false,
    page: 1,
    pageSize: 1,
    type,
  });
  return { hasData: Boolean(query.data), total: query.data?.total ?? 0 };
}

export function SpaceDataContactsRootTab({ params }: UiTabRenderProps) {
  const { t } = useTranslation("contacts");
  const { spaceKey = "" } = useParams();
  const folders = useMemo(
    () => (Array.isArray(params.folders) ? params.folders.filter(isRow) : []),
    [params.folders]
  );
  const entries = useMemo<EntryRow[]>(
    () => (Array.isArray(params.entries) ? params.entries.filter(isRow) : []),
    [params.entries]
  );

  const people = useContactTypeTotal("person");
  const organisations = useContactTypeTotal("organisation");
  const totals: Record<ContactType, { hasData: boolean; total: number }> = {
    organisation: organisations,
    person: people,
  };

  if (params.isPending === true) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
      <ul className="grid gap-3 sm:grid-cols-2">
        {folders.map((folder) => {
          const type = typeOfFolder(folder.name);
          const count = type ? totals[type] : null;
          return (
            <li key={folder.path}>
              <Link
                className={uiStatusCardClassName}
                to={`/s/${encodeURIComponent(spaceKey)}/data?as=folder&path=${encodeURIComponent(folder.path)}`}
              >
                <span className="flex items-center gap-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t(`spaceData.root.${folder.name}`, {
                    defaultValue: folder.name,
                  })}
                  <ChevronRight className="size-3.5" />
                </span>
                {/* No data is "—", never 0: a failed count rendered as zero
                    says the address book is empty when nobody looked. */}
                <span className="font-semibold text-2xl tabular-nums">
                  {count?.hasData ? count.total : "—"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {entries.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            {t("spaceData.root.everything", {
              defaultValue: "Everyone, as one table",
            })}
          </h2>
          <ul
            className={cn(uiCardElevatedClassName, "divide-y overflow-hidden")}
          >
            {entries.map((entry) => (
              <li key={entry.path}>
                <Link
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 text-sm",
                    uiRowHoverClassName
                  )}
                  to={`/s/${encodeURIComponent(spaceKey)}/data?path=${encodeURIComponent(entry.path)}`}
                >
                  <Table2 className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
