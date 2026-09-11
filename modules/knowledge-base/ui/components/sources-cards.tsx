import { useTranslation } from "@engenty/i18n/ui";
import {
  adminListCardsGridClassName,
  Badge,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import { MoreVertical } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { KbSource } from "../../src/schema/types.js";
import type { KbSourceAdapterDescriptor } from "../api.js";
import { kbSourcePath } from "../kb-paths.js";
import { SourcesRowMenuItems } from "./sources-row-menu-items.js";

type TableSize = "compact" | "normal";

interface SourcesCardsProps {
  adapters: KbSourceAdapterDescriptor[];
  onDelete: (source: KbSource) => void;
  onEdit: (source: KbSource) => void;
  onOpenItems: (source: KbSource) => void;
  onRotate: (source: KbSource) => void;
  onRun: (source: KbSource) => void;
  sources: KbSource[];
  tableSize: TableSize;
}

export function SourcesCards({
  sources,
  adapters,
  tableSize,
  onEdit,
  onOpenItems,
  onRun,
  onRotate,
  onDelete,
}: SourcesCardsProps) {
  const { t } = useTranslation("kb");
  const navigate = useNavigate();

  function adapterLabel(source: KbSource) {
    return (
      adapters.find((a) => a.id === source.adapter_id)?.label ??
      source.adapter_id.replaceAll("_", " ")
    );
  }

  return (
    <div className={adminListCardsGridClassName(tableSize)}>
      {sources.map((source) => (
        <div
          className={cn(
            "ui-card-raised ui-card-interactive relative text-left",
            tableSize === "compact" ? "p-3" : "p-4"
          )}
          key={source.id}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={t("sources.actions")}
                className="absolute top-2 right-2 h-8 w-8"
                onClick={(e) => e.stopPropagation()}
                size="icon"
                type="button"
                variant="ghost"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <SourcesRowMenuItems
                onDelete={onDelete}
                onEdit={onEdit}
                onOpenItems={onOpenItems}
                onRotate={onRotate}
                onRun={onRun}
                source={source}
              />
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            className="w-full pr-10 text-left"
            onClick={() => navigate(kbSourcePath(source.id))}
            type="button"
          >
            <div className="flex items-start justify-between gap-3 pr-2">
              <p className="font-medium">{source.name}</p>
              <Badge variant="outline">{source.status}</Badge>
            </div>
            <p
              className={`text-muted-foreground text-sm ${tableSize === "compact" ? "mt-1" : "mt-2"}`}
            >
              {adapterLabel(source)}
            </p>
            <p className="text-muted-foreground text-xs">
              {t("sources.last_run")}:{" "}
              {source.last_run_at
                ? new Date(source.last_run_at).toLocaleString()
                : t("sources.never")}
            </p>
          </button>
        </div>
      ))}
    </div>
  );
}
