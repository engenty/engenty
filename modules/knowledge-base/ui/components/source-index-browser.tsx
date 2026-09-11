import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Button,
  Checkbox,
  Input,
  Skeleton,
  STICKY_HEADER_CLASS,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@engenty/ui-core";
import { ExternalLink } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import type { KbSourceIndexEntry } from "../api.js";

interface Props {
  entries: KbSourceIndexEntry[];
  isLoading: boolean;
  onSelectionChange: (selectedKeys: string[]) => void;
  selectedKeys: Set<string>;
  total: number;
}

export function SourceIndexBrowser({
  entries,
  isLoading,
  onSelectionChange,
  selectedKeys,
  total,
}: Props) {
  const { t } = useTranslation("kb");
  const [filter, setFilter] = useState("");

  const filteredEntries = useMemo(() => {
    if (!filter.trim()) {
      return entries;
    }
    const lower = filter.toLowerCase();
    return entries.filter(
      (e) =>
        (e.title ?? "").toLowerCase().includes(lower) ||
        e.source_url.toLowerCase().includes(lower) ||
        e.item_key.toLowerCase().includes(lower)
    );
  }, [entries, filter]);

  const allFilteredSelected =
    filteredEntries.length > 0 &&
    filteredEntries.every((e) => selectedKeys.has(e.item_key));

  const someFilteredSelected =
    !allFilteredSelected &&
    filteredEntries.some((e) => selectedKeys.has(e.item_key));

  const toggleSelectAll = useCallback(() => {
    if (allFilteredSelected) {
      const toRemove = new Set(filteredEntries.map((e) => e.item_key));
      onSelectionChange([...selectedKeys].filter((k) => !toRemove.has(k)));
    } else {
      const merged = new Set(selectedKeys);
      for (const e of filteredEntries) {
        merged.add(e.item_key);
      }
      onSelectionChange([...merged]);
    }
  }, [allFilteredSelected, filteredEntries, selectedKeys, onSelectionChange]);

  const toggleItem = useCallback(
    (key: string) => {
      const next = new Set(selectedKeys);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      onSelectionChange([...next]);
    },
    [selectedKeys, onSelectionChange]
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3 overflow-x-hidden">
      <div className="flex min-w-0 items-center gap-2">
        <Input
          className="h-8 min-w-0 flex-1 text-sm"
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("sources.index_browser_filter_placeholder")}
          value={filter}
        />
        <span className="shrink-0 text-muted-foreground text-xs">
          {t("sources.index_browser_count", {
            count: filteredEntries.length,
            total,
          })}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={filteredEntries.length === 0}
          onClick={() => {
            const merged = new Set(selectedKeys);
            for (const entry of filteredEntries) {
              merged.add(entry.item_key);
            }
            onSelectionChange([...merged]);
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          {t("sources.index_browser_select_visible")}
        </Button>
        <Button
          disabled={filteredEntries.length === 0}
          onClick={() => {
            const visible = new Set(filteredEntries.map((e) => e.item_key));
            onSelectionChange([...selectedKeys].filter((k) => !visible.has(k)));
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          {t("sources.index_browser_deselect_visible")}
        </Button>
        <span className="ml-auto text-muted-foreground text-xs">
          {t("sources.index_browser_ignored_count", {
            count: Math.max(0, entries.length - selectedKeys.size),
          })}
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground text-sm">
          {t("sources.index_browser_empty")}
        </p>
      ) : filteredEntries.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground text-sm">
          {t("sources.index_browser_no_match")}
        </p>
      ) : (
        <div className="ui-card-elevated min-w-0 overflow-hidden">
          <div className="max-h-[420px] min-h-0 overflow-y-auto overflow-x-hidden">
            <Table className="table-fixed" noWrapper>
              <TableHeader className={STICKY_HEADER_CLASS}>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label={t(
                        "sources.index_browser_select_all_filtered"
                      )}
                      checked={
                        allFilteredSelected
                          ? true
                          : someFilteredSelected
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="min-w-0">
                    {t("sources.index_browser_col_title")}
                  </TableHead>
                  <TableHead className="hidden w-[35%] md:table-cell">
                    {t("sources.index_browser_col_url")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEntries.map((entry) => (
                  <TableRow
                    className="cursor-pointer"
                    key={entry.item_key}
                    onClick={() => toggleItem(entry.item_key)}
                  >
                    <TableCell className="w-10">
                      <Checkbox
                        aria-label={entry.title ?? entry.item_key}
                        checked={selectedKeys.has(entry.item_key)}
                        onCheckedChange={() => toggleItem(entry.item_key)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </TableCell>
                    <TableCell className="min-w-0 whitespace-normal font-medium text-sm">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate">
                          {entry.title ?? entry.item_key}
                        </span>
                        {selectedKeys.has(entry.item_key) ? null : (
                          <Badge className="shrink-0" variant="secondary">
                            {t("sources.index_browser_ignored_badge")}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden min-w-0 whitespace-normal text-muted-foreground text-xs md:table-cell">
                      <a
                        className="flex min-w-0 items-center gap-1 hover:underline"
                        href={entry.source_url}
                        onClick={(e) => e.stopPropagation()}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        <span className="truncate">{entry.source_url}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {selectedKeys.size > 0 && (
        <p className="text-muted-foreground text-xs">
          {t("sources.index_browser_selected_count", {
            count: selectedKeys.size,
          })}
        </p>
      )}
    </div>
  );
}
