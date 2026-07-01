import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import type React from "react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { KbSourceItem } from "../../src/schema/types.js";
import { kbInboxDetailPath } from "../kb-paths.js";
import { SourceItemMetadataRow } from "./source-item-metadata-row.js";

interface SourceItemMetadataEntry {
  label: string;
  tooltip?: string;
  value: React.ReactNode;
}

function presentRows(
  rows: Array<SourceItemMetadataEntry | null>
): SourceItemMetadataEntry[] {
  return rows.filter((row): row is SourceItemMetadataEntry => row !== null);
}

export function sourceItemHeadingTitle(
  item: Pick<KbSourceItem, "adapter_item_key" | "source_url" | "title">
): string {
  return (
    item.title?.trim() ||
    item.source_url?.trim() ||
    item.adapter_item_key ||
    "—"
  );
}

export function SourceItemDetailHeader({
  extraMetadata,
  item,
  kbSlug,
}: {
  extraMetadata: Record<string, unknown>;
  item: KbSourceItem;
  kbSlug: string;
}) {
  const { t } = useTranslation("kb");
  const [showMore, setShowMore] = useState(false);
  const hasExtraMetadata = Object.keys(extraMetadata).length > 0;

  const primaryRows = useMemo(
    () =>
      presentRows([
        {
          label: t("sources.status"),
          value: (
            <span className="capitalize">
              {item.status.replaceAll("_", " ")}
            </span>
          ),
        },
        item.source_url
          ? {
              label: t("sources.source_url_label"),
              value: (
                <a
                  className="break-all text-primary hover:underline"
                  href={item.source_url}
                  rel="noreferrer"
                  target="_blank"
                >
                  {item.source_url}
                </a>
              ),
            }
          : null,
        item.inbox_item_id
          ? {
              label: t("sources.inbox_entry_id"),
              tooltip: t("sources.inbox_entry_tooltip"),
              value:
                kbSlug && item.inbox_item_id ? (
                  <Link
                    className="break-all font-mono text-primary text-xs hover:underline"
                    to={kbInboxDetailPath(kbSlug, item.inbox_item_id)}
                  >
                    {item.inbox_item_id}
                  </Link>
                ) : (
                  <span className="break-all font-mono text-muted-foreground text-xs">
                    {item.inbox_item_id}
                  </span>
                ),
            }
          : null,
        {
          label: t("sources.last_seen"),
          value: item.last_seen_at
            ? new Date(item.last_seen_at).toLocaleString()
            : t("sources.never"),
        },
        typeof item.metadata?.last_retrieve_error === "string" &&
        item.metadata.last_retrieve_error.trim()
          ? {
              label: t("sources.last_retrieve_error"),
              value: (
                <span className="break-words text-destructive text-sm leading-snug">
                  {item.metadata.last_retrieve_error}
                </span>
              ),
            }
          : null,
        {
          label: t("sources.source_item_updated"),
          value: new Date(item.updated_at).toLocaleString(),
        },
      ]),
    [item, kbSlug, t]
  );

  const technicalRows = useMemo(
    () =>
      presentRows([
        {
          label: t("sources.source_item_key"),
          value: (
            <span className="break-all font-mono text-xs">
              {item.adapter_item_key}
            </span>
          ),
        },
        item.content_hash
          ? {
              label: t("sources.content_hash"),
              tooltip: t("sources.content_hash_tooltip"),
              value: (
                <span className="break-all font-mono text-muted-foreground text-xs">
                  {item.content_hash}
                </span>
              ),
            }
          : null,
        typeof item.metadata?.probe_etag === "string" &&
        item.metadata.probe_etag.trim()
          ? {
              label: t("sources.probe_etag"),
              tooltip: t("sources.probe_etag_tooltip"),
              value: (
                <span className="break-all font-mono text-muted-foreground text-xs">
                  {item.metadata.probe_etag}
                </span>
              ),
            }
          : null,
        typeof item.metadata?.probe_last_modified === "string" &&
        item.metadata.probe_last_modified.trim()
          ? {
              label: t("sources.probe_last_modified"),
              tooltip: t("sources.probe_last_modified_tooltip"),
              value: (
                <span className="break-all font-mono text-muted-foreground text-xs">
                  {item.metadata.probe_last_modified}
                </span>
              ),
            }
          : null,
        hasExtraMetadata
          ? {
              label: t("sources.item_metadata_other"),
              value: (
                <pre className="max-h-40 min-w-0 overflow-auto rounded-md bg-muted/40 p-2 font-mono text-xs">
                  {JSON.stringify(extraMetadata, null, 2)}
                </pre>
              ),
            }
          : null,
      ]),
    [extraMetadata, hasExtraMetadata, item, t]
  );

  return (
    <>
      <header className="flex min-w-0 flex-col gap-1">
        <p className="font-medium text-muted-foreground text-sm">
          {t("sources.source_item_heading")}
        </p>
        <h1 className="font-semibold text-xl tracking-tight">
          {sourceItemHeadingTitle(item)}
        </h1>
      </header>

      <div className="flex flex-col gap-2">
        {primaryRows.map((row) => (
          <SourceItemMetadataRow
            key={row.label}
            label={row.label}
            tooltip={row.tooltip}
          >
            {row.value}
          </SourceItemMetadataRow>
        ))}
        {showMore
          ? technicalRows.map((row) => (
              <SourceItemMetadataRow
                key={row.label}
                label={row.label}
                tooltip={row.tooltip}
              >
                {row.value}
              </SourceItemMetadataRow>
            ))
          : null}
        {technicalRows.length > 0 ? (
          <Button
            className="h-auto w-fit p-0 text-muted-foreground text-sm"
            onClick={() => setShowMore((value) => !value)}
            type="button"
            variant="link"
          >
            {showMore
              ? t("sources.metadata_show_less")
              : t("sources.metadata_show_more")}
          </Button>
        ) : null}
      </div>
    </>
  );
}
