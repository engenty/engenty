import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  AdminListTableView,
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  STICKY_HEADER_CLASS,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@engenty/ui-core";
import { type FormEvent, Fragment, useMemo, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { PageState } from "@/components/PageState";
import type { LogEntry } from "@/lib/api/logs";
import { logEntriesQuery, logFilesQuery } from "@/lib/queries/logs";

const PAGE_SIZE = 100;
const LEVELS = ["error", "warn", "info", "debug"] as const;
const ALL_LEVELS = "__all__";

type BadgeVariant = "default" | "secondary" | "outline";

const LEVEL_VARIANT: Record<string, BadgeVariant> = {
  error: "outline",
  warn: "outline",
  info: "secondary",
  debug: "outline",
};

// Levels that should read red even though Badge has no destructive variant.
const DANGER_CLASS = "border-destructive text-destructive";
const WARN_CLASS = "border-amber-500/60 text-amber-600 dark:text-amber-400";

function firstString(entry: LogEntry, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = entry[key];
    if (typeof value === "string" && value) {
      return value;
    }
    if (typeof value === "number") {
      return String(value);
    }
  }
  return;
}

function entryLevel(entry: LogEntry): string {
  return (firstString(entry, ["level", "lvl", "severity"]) ?? "info")
    .toLowerCase()
    .trim();
}

function entryTime(entry: LogEntry): string {
  return (
    firstString(entry, ["_time", "time", "timestamp", "ts", "@timestamp"]) ?? ""
  );
}

function entrySource(entry: LogEntry): string {
  return (
    firstString(entry, ["namespace", "scope", "ns", "source", "name"]) ?? "—"
  );
}

function entryMessage(entry: LogEntry): string {
  return (
    firstString(entry, ["message", "msg", "event", "text"]) ??
    JSON.stringify(entry)
  );
}

export function LogsPage() {
  const { t } = useTranslation("common");
  const files = useQuery(logFilesQuery);
  const [date, setDate] = useState<string>("");
  const [level, setLevel] = useState<string>(ALL_LEVELS);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);

  // Default to the first available file once the list resolves.
  const activeDate = date || files.data?.[0]?.date || "";

  const params = useMemo(
    () => ({
      date: activeDate,
      level: level === ALL_LEVELS ? undefined : level,
      search: search || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [activeDate, level, search, page]
  );

  const entriesQuery = useQuery(logEntriesQuery(params));
  const entries = entriesQuery.data?.entries ?? [];
  const total = entriesQuery.data?.total ?? 0;
  const rangeStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = page * PAGE_SIZE + entries.length;

  const resetPaging = () => {
    setPage(0);
    setExpanded(null);
  };

  const onSearchSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSearch(searchInput.trim());
    resetPaging();
  };

  const fileLabel = (file: { date: string; label?: string }) =>
    file.label ?? file.date;

  return (
    <PageShell
      breadcrumbs={[{ label: t("logs.title") }]}
      title={t("logs.title")}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-page">
        <p className="text-muted-foreground text-sm">{t("logs.subtitle")}</p>

        <div className="flex flex-wrap items-end gap-2">
          <Select
            onValueChange={(value) => {
              setDate(value);
              resetPaging();
            }}
            value={activeDate}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder={t("logs.selectFile")} />
            </SelectTrigger>
            <SelectContent>
              {(files.data ?? []).map((file) => (
                <SelectItem key={file.date} value={file.date}>
                  {fileLabel(file)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            onValueChange={(value) => {
              setLevel(value);
              resetPaging();
            }}
            value={level}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_LEVELS}>{t("logs.allLevels")}</SelectItem>
              {LEVELS.map((lvl) => (
                <SelectItem key={lvl} value={lvl}>
                  {lvl}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <form className="flex items-end gap-2" onSubmit={onSearchSubmit}>
            <Input
              aria-label={t("common.search")}
              className="w-64"
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t("logs.searchPlaceholder")}
              value={searchInput}
            />
            <Button size="sm" type="submit" variant="outline">
              {t("common.search")}
            </Button>
          </form>
        </div>

        <PageState
          error={files.error ?? entriesQuery.error}
          isEmpty={Boolean(activeDate) && entries.length === 0}
          isLoading={
            files.isLoading || (entriesQuery.isLoading && !!activeDate)
          }
          onRetry={() => void entriesQuery.refetch()}
        >
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span>
              {t("logs.range", {
                start: rangeStart,
                end: rangeEnd,
                total,
              })}
            </span>
            <span className="flex items-center gap-2">
              <Button
                disabled={page === 0}
                onClick={() => {
                  setPage((p) => Math.max(0, p - 1));
                  setExpanded(null);
                }}
                size="sm"
                variant="outline"
              >
                {t("common.previous")}
              </Button>
              <Button
                disabled={rangeEnd >= total}
                onClick={() => {
                  setPage((p) => p + 1);
                  setExpanded(null);
                }}
                size="sm"
                variant="outline"
              >
                {t("common.next")}
              </Button>
            </span>
          </div>

          <AdminListTableView>
            <Table noWrapper>
              <TableHeader className={STICKY_HEADER_CLASS}>
                <TableRow>
                  <TableHead className="w-52">
                    {t("logs.columns.time")}
                  </TableHead>
                  <TableHead className="w-24">
                    {t("logs.columns.level")}
                  </TableHead>
                  <TableHead className="w-40">
                    {t("logs.columns.source")}
                  </TableHead>
                  <TableHead>{t("logs.columns.message")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry, index) => {
                  const lvl = entryLevel(entry);
                  const isOpen = expanded === index;
                  return (
                    <Fragment key={`${entryTime(entry)}-${index}`}>
                      <TableRow
                        className="cursor-pointer align-top"
                        onClick={() => setExpanded(isOpen ? null : index)}
                      >
                        <TableCell className="font-mono text-muted-foreground text-xs">
                          {entryTime(entry) || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={
                              lvl === "error"
                                ? DANGER_CLASS
                                : lvl === "warn"
                                  ? WARN_CLASS
                                  : undefined
                            }
                            variant={LEVEL_VARIANT[lvl] ?? "outline"}
                          >
                            {lvl}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground text-xs">
                          {entrySource(entry)}
                        </TableCell>
                        <TableCell className="text-sm">
                          <span className="line-clamp-2 break-words">
                            {entryMessage(entry)}
                          </span>
                        </TableCell>
                      </TableRow>
                      {isOpen ? (
                        <TableRow>
                          <TableCell className="bg-muted/40" colSpan={4}>
                            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all font-mono text-xs">
                              {JSON.stringify(entry, null, 2)}
                            </pre>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </AdminListTableView>
        </PageState>
      </div>
    </PageShell>
  );
}
