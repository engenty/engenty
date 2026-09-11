/**
 * Floating control panel for the KB graph view.
 * Provides search, status filter, and tag filter.
 */

import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { AnimatedRefreshIcon } from "@engenty/ui-icons";
import { RotateCcw, Search } from "lucide-react";
import type { KbGraphTag } from "../../../src/schema/types.js";
import type { KbGraphFilter } from "./use-kb-graph-data.js";

interface Props {
  filter: KbGraphFilter;
  isReloading?: boolean;
  nodeCount: number;
  onChange: (next: KbGraphFilter) => void;
  onReload?: () => void;
  onReset: () => void;
  tags: KbGraphTag[];
}

export function KbGraphControls({
  filter,
  isReloading = false,
  nodeCount,
  tags,
  onChange,
  onReload,
  onReset,
}: Props) {
  const { t } = useTranslation("kb");

  const toggleTag = (tagId: string) => {
    const next = filter.tagFilter.includes(tagId)
      ? filter.tagFilter.filter((t) => t !== tagId)
      : [...filter.tagFilter, tagId];
    onChange({ ...filter, tagFilter: next });
  };

  return (
    <div className="absolute top-3 right-3 z-10 flex w-56 flex-col gap-2 rounded-xl border border-border bg-background/90 p-3 shadow-lg backdrop-blur-sm">
      {/* Search */}
      <div className="relative">
        <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-7 pl-7 text-xs"
          onChange={(e) => onChange({ ...filter, search: e.target.value })}
          placeholder={t("inbox.graph_search")}
          value={filter.search}
        />
      </div>

      {/* Status filter */}
      <Select
        onValueChange={(v) =>
          onChange({
            ...filter,
            statusFilter: v as KbGraphFilter["statusFilter"],
          })
        }
        value={filter.statusFilter}
      >
        <SelectTrigger className="h-7 text-xs">
          <SelectValue placeholder={t("inbox.graph_filter_status")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">
            {t("inbox.graph_filter_status_all")}
          </SelectItem>
          <SelectItem value="published">Published</SelectItem>
          <SelectItem value="draft">Draft</SelectItem>
          <SelectItem value="archived">Archived</SelectItem>
        </SelectContent>
      </Select>

      {/* Tag filter */}
      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <Badge
              className="cursor-pointer text-xxs"
              key={tag.id}
              onClick={() => toggleTag(tag.id)}
              style={
                filter.tagFilter.includes(tag.id)
                  ? {
                      backgroundColor: tag.color ?? "#6366f1",
                      color: "#fff",
                      borderColor: "transparent",
                    }
                  : undefined
              }
              variant={
                filter.tagFilter.includes(tag.id) ? "default" : "outline"
              }
            >
              {tag.name}
            </Badge>
          ))}
        </div>
      ) : null}

      {/* Footer: node count + reset */}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <span className="min-w-0 truncate text-muted-foreground text-xxs">
          {t("inbox.graph_nodes", { count: nodeCount })}
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          {onReload ? (
            <Button
              className="h-6 gap-1 px-2 text-xxs"
              disabled={isReloading}
              onClick={onReload}
              size="sm"
              title={t("inbox.graph_reload_title")}
              type="button"
              variant="ghost"
            >
              <AnimatedRefreshIcon
                play={isReloading ? "always" : "hover"}
                size={12}
              />
              {t("inbox.graph_reload")}
            </Button>
          ) : null}
          <Button
            className="h-6 gap-1 px-2 text-xxs"
            onClick={onReset}
            size="sm"
            type="button"
            variant="ghost"
          >
            <RotateCcw className="h-3 w-3" />
            {t("inbox.graph_reset")}
          </Button>
        </div>
      </div>
    </div>
  );
}
