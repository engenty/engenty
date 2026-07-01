import { useTranslation } from "@engenty/i18n/ui";
import { adminListCardsGridClassName, Badge, cn } from "@engenty/ui-core";
import { Plug } from "lucide-react";
import { Link } from "react-router-dom";
import type { InboxItem } from "../../src/schema/types.js";
import { kbInboxDetailPath, kbSourcePath } from "../kb-paths.js";
import { kbAdapterRegistryLabel } from "../lib/kb-adapter-registry-label.js";

type TableSize = "compact" | "normal";

interface InboxCardsProps {
  items: InboxItem[];
  kbSlug: string;
  tableSize: TableSize;
}

export function InboxCards({ items, kbSlug, tableSize }: InboxCardsProps) {
  const { t } = useTranslation("kb");
  const pad = tableSize === "compact" ? "p-3" : "p-4";

  return (
    <div
      className={cn(
        adminListCardsGridClassName(tableSize),
        tableSize === "compact" ? "p-3" : "p-4"
      )}
    >
      {items.map((row) => {
        const linkedSid = row.linked_kb_source_id;
        const linkedAid = row.linked_adapter_id;
        const adapterLabel =
          linkedSid && linkedAid ? kbAdapterRegistryLabel(linkedAid) : null;

        return (
          <div
            className={`rounded-lg border bg-card text-left ${pad}`}
            key={row.id}
          >
            <Link
              className="block rounded-md transition-colors hover:bg-accent/20"
              to={kbInboxDetailPath(kbSlug, row.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">{row.title}</p>
                <Badge className="shrink-0" variant="outline">
                  {row.status}
                </Badge>
              </div>
              <p
                className={`text-muted-foreground text-sm ${tableSize === "compact" ? "mt-1" : "mt-2"}`}
              >
                {row.source_type} · {new Date(row.captured_at).toLocaleString()}
              </p>
            </Link>
            {adapterLabel && linkedSid ? (
              <div className="mt-2 flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">
                  {t("inbox.col_adapter_type")}:
                </span>
                <span className="min-w-0 truncate">{adapterLabel}</span>
                <Link
                  aria-label={t("inbox.open_linked_source")}
                  className="shrink-0 text-primary hover:text-primary/90"
                  onClick={(e) => e.stopPropagation()}
                  title={t("inbox.open_linked_source")}
                  to={kbSourcePath(kbSlug, linkedSid)}
                >
                  <Plug className="h-4 w-4" />
                </Link>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
