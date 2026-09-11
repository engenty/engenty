/**
 * `/work` — every piece of work across the spaces the viewer may see.
 *
 * Lives on the app rail, not inside a space: it is the one Tasks surface that
 * spans spaces, which is why its menu row overrides the module's space
 * placement. Grouped by space, because the space is the answer to "where does
 * this row live"; a click lands on the record inside its own space. The rows
 * arrive already narrowed by the server; this page only groups and filters.
 */
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  Button,
  cn,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getSpaces, type SpaceRef } from "../api.js";
import { getWorkTabs, type WorkTab } from "../work-tabs.js";

const ALL = "all";

interface SpaceGroup<T> {
  rows: T[];
  space: SpaceRef | null;
  spaceId: string;
}

/** Rows by space, in the rail's space order; unknown spaces last. */
function groupBySpace<T>(
  rows: readonly T[],
  spaceIdOf: (row: T) => string | null,
  spaces: readonly SpaceRef[]
): SpaceGroup<T>[] {
  const byId = new Map<string, T[]>();
  for (const row of rows) {
    const spaceId = spaceIdOf(row) ?? "";
    const list = byId.get(spaceId) ?? [];
    list.push(row);
    byId.set(spaceId, list);
  }
  const ordered: SpaceGroup<T>[] = [];
  for (const space of spaces) {
    const list = byId.get(space.id);
    if (list) {
      ordered.push({ rows: list, space, spaceId: space.id });
      byId.delete(space.id);
    }
  }
  for (const [spaceId, list] of byId) {
    ordered.push({ rows: list, space: null, spaceId });
  }
  return ordered;
}

export function WorkOverviewPage() {
  const { t } = useTranslation("tasks");
  const tabs = useMemo(() => getWorkTabs(), []);
  const [tabId, setTabId] = useState<string>(tabs[0]?.id ?? "");
  const tab = tabs.find((entry) => entry.id === tabId) ?? tabs[0] ?? null;
  const [spaceId, setSpaceId] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const [mine, setMine] = useState(false);

  usePageConfig({
    actions: null,
    breadcrumbs: [{ label: t("work.title") }],
    contentStackBackground: "paper",
  });

  const spacesQuery = useQuery({
    queryFn: ({ signal }) => getSpaces(signal),
    queryKey: ["tasks", "work", "spaces"],
    staleTime: 60_000,
  });
  const spaces = useMemo(() => spacesQuery.data ?? [], [spacesQuery.data]);

  const spaceFilter = spaceId === ALL ? null : spaceId;
  const wantMine = Boolean(tab?.supportsMine && mine);
  const rowsQuery = useQuery({
    enabled: tab !== null,
    queryFn: ({ signal }) =>
      (tab as WorkTab<unknown>).load(
        { mine: wantMine, spaceId: spaceFilter },
        signal
      ),
    queryKey: [
      "tasks",
      "work",
      tab?.id,
      { mine: wantMine, spaceId: spaceFilter },
    ],
  });

  const allRows = rowsQuery.data?.rows ?? [];
  const statusOf = tab?.statusOf;
  const statuses = useMemo(
    () =>
      statusOf
        ? [...new Set(allRows.map((row) => statusOf(row)))]
            .filter(Boolean)
            .sort()
        : [],
    [allRows, statusOf]
  );
  const rows = useMemo(
    () =>
      statusOf && status !== ALL
        ? allRows.filter((row) => statusOf(row) === status)
        : allRows,
    [allRows, status, statusOf]
  );
  const groups = useMemo(
    () => (tab ? groupBySpace(rows, tab.spaceIdOf, spaces) : []),
    [rows, spaces, tab]
  );
  const total = rowsQuery.data?.total ?? 0;
  const capped = allRows.length < total;

  if (!tab) {
    return null;
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">{t("work.description")}</p>

      <div className="flex flex-wrap items-center gap-2">
        {tabs.length > 1 ? (
          <Tabs onValueChange={setTabId} value={tab.id}>
            <TabsList>
              {tabs.map((entry) => (
                <TabsTrigger key={entry.id} value={entry.id}>
                  {entry.labelKey
                    ? t(entry.labelKey, { defaultValue: entry.label })
                    : entry.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        ) : null}
        <Select onValueChange={setSpaceId} value={spaceId}>
          <SelectTrigger aria-label={t("work.filter.space")} className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("work.filter.allSpaces")}</SelectItem>
            {spaces.map((space) => (
              <SelectItem key={space.id} value={space.id}>
                {space.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {tab.statusOf ? (
          <Select onValueChange={setStatus} value={status}>
            <SelectTrigger
              aria-label={t("work.filter.status")}
              className="w-44"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>
                {t("work.filter.allStatuses")}
              </SelectItem>
              {statuses.map((entry) => (
                <SelectItem key={entry} value={entry}>
                  {entry}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        {tab.supportsMine ? (
          <Button
            aria-pressed={mine}
            onClick={() => setMine((value) => !value)}
            size="sm"
            type="button"
            variant={mine ? "secondary" : "outline"}
          >
            {t("work.filter.mine")}
          </Button>
        ) : null}
      </div>

      {rowsQuery.isPending ? (
        <div className="flex items-center gap-2 p-4 text-muted-foreground text-sm">
          <Spinner className="size-4" />
          {t("work.loading")}
        </div>
      ) : rowsQuery.isError ? (
        <p className="p-4 text-destructive text-sm">{t("work.loadFailed")}</p>
      ) : rows.length === 0 ? (
        <p className="p-4 text-muted-foreground text-sm">{t("work.empty")}</p>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section
              className="ui-card-panel overflow-hidden"
              key={group.spaceId}
            >
              <GroupHeading
                count={group.rows.length}
                href={
                  group.space
                    ? `/s/${encodeURIComponent(group.space.key)}`
                    : null
                }
                name={group.space?.name ?? t("work.unknownSpace")}
              />
              <WorkTable rows={group.rows} space={group.space} tab={tab} />
            </section>
          ))}
        </div>
      )}
      {capped ? (
        <p className="text-muted-foreground text-xs">
          {t("work.capped", { shown: allRows.length, total })}
        </p>
      ) : null}
    </div>
  );
}

function GroupHeading({
  count,
  href,
  name,
}: {
  count: number;
  href: string | null;
  name: string;
}) {
  return (
    <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
      {href ? (
        <Link className="font-medium text-sm hover:underline" to={href}>
          {name}
        </Link>
      ) : (
        <span className="font-medium text-sm">{name}</span>
      )}
      <span className="text-muted-foreground text-xs tabular-nums">
        {count}
      </span>
    </div>
  );
}

function WorkTable<T>({
  rows,
  space,
  tab,
}: {
  rows: T[];
  space: SpaceRef | null;
  tab: WorkTab<T>;
}) {
  const { t } = useTranslation("tasks");
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {tab.columns.map((column) => (
            <TableHead className={column.className} key={column.key}>
              {column.labelKey
                ? t(column.labelKey, { defaultValue: column.label })
                : column.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const href = space ? tab.href(row, space.key) : null;
          return (
            <TableRow key={tab.rowKey(row)}>
              {tab.columns.map((column) => (
                <TableCell className={cn(column.className)} key={column.key}>
                  {column.link && href ? (
                    <Link className="hover:underline" to={href}>
                      {column.render(row)}
                    </Link>
                  ) : (
                    column.render(row)
                  )}
                </TableCell>
              ))}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
