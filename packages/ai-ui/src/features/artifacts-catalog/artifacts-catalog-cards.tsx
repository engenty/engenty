// Grouped card view for the artifacts catalog. The group header adapts to the
// active grouping (scope / type / storage / status / creator); scope groups
// also show an audience hint ("who can see it"). Each card opens the artifact.

import { useTranslation } from "@engenty/i18n/ui";
import {
  AdminListGroupHeader,
  AdminListGroupPill,
  adminListCardsGridClassName,
  Badge,
  cn,
  type TableSize,
} from "@engenty/ui-core";
import { Bot, CloudUpload, FileStack, User, Users } from "lucide-react";
import { Fragment } from "react";
import { useNavigate } from "react-router-dom";
import type { AdminArtifactRow } from "../../artifacts/artifacts-api";
import { buildArtifactDetailPath } from "../agents-workspace/agent-workspace-paths";
import { formatRelativeDate } from "../agents-workspace/date-format";
import {
  describeStorage,
  resolveGroupHeader,
  type StorageDescriptor,
} from "./artifacts-catalog-display";
import {
  type ArtifactCatalogGroup,
  type ArtifactGroupBy,
  formatArtifactSize,
  shortArtifactId,
} from "./artifacts-catalog-state";

interface ArtifactsCatalogCardsProps {
  groupBy: ArtifactGroupBy;
  groups: ArtifactCatalogGroup[];
  isGroupOpen: (id: string) => boolean;
  onToggleGroup: (id: string) => void;
  tableSize: TableSize;
}

export function ArtifactsCatalogCards({
  groupBy,
  groups,
  isGroupOpen,
  onToggleGroup,
  tableSize,
}: ArtifactsCatalogCardsProps) {
  const { t } = useTranslation("ai-ui");
  const grouped = groupBy !== "none";

  const groupCountLabel = (count: number) =>
    `${count} ${
      count === 1
        ? t("artifactsCatalog.groupCountSingular")
        : t("artifactsCatalog.groupCountPlural")
    }`;

  return (
    <div className="flex flex-col gap-2">
      {groups.map((group) => {
        const open = grouped ? isGroupOpen(group.id) : true;
        const header = resolveGroupHeader(t, groupBy, group.id);
        return (
          <Fragment key={group.id}>
            {grouped ? (
              <AdminListGroupHeader
                count={groupCountLabel(group.rows.length)}
                onToggle={() => onToggleGroup(group.id)}
                open={open}
                toggleLabel={t("artifactsCatalog.toggleGroup")}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <header.Icon
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <AdminListGroupPill>{header.label}</AdminListGroupPill>
                  {header.sub ? (
                    <span className="flex min-w-0 items-center gap-1 text-muted-foreground text-xs">
                      <Users aria-hidden className="size-3 shrink-0" />
                      <span className="truncate">{header.sub}</span>
                    </span>
                  ) : null}
                </span>
              </AdminListGroupHeader>
            ) : null}
            {open ? (
              <div
                className={cn(
                  adminListCardsGridClassName(tableSize),
                  grouped && "mb-2"
                )}
              >
                {group.rows.map((row) => (
                  <ArtifactCard
                    key={row.id}
                    row={row}
                    storage={describeStorage(t, row.storage)}
                    t={t}
                  />
                ))}
              </div>
            ) : null}
          </Fragment>
        );
      })}
    </div>
  );
}

function ArtifactCard({
  row,
  storage,
  t,
}: {
  row: AdminArtifactRow;
  storage: StorageDescriptor;
  t: (key: string) => string;
}) {
  const navigate = useNavigate();
  const size = formatArtifactSize(row.size_bytes);
  const mirror = row.metadata.external_mirror;
  const CreatorIcon = row.created_by_kind === "agent" ? Bot : User;
  const updated = formatRelativeDate(row.updated_at);

  return (
    <button
      className="ui-canvas-elevated flex flex-col rounded-lg bg-card p-3 text-left transition-shadow hover:shadow-[var(--e-3)]"
      onClick={() =>
        navigate(buildArtifactDetailPath(row.id), { state: { row } })
      }
      type="button"
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <FileStack
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground opacity-80"
          />
          <span className="truncate font-medium text-sm">{row.title}</span>
        </div>
        <Badge className="shrink-0 font-mono text-[10px]" variant="secondary">
          {row.type}
        </Badge>
      </div>

      <p
        className="mt-1 truncate font-mono text-muted-foreground text-xs"
        title={row.scope_id}
      >
        {shortArtifactId(row.scope_id)}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
        <span className="inline-flex items-center gap-1" title={storage.label}>
          <storage.Icon aria-hidden className="size-3.5 shrink-0" />
          {storage.label}
        </span>
        {mirror ? (
          <span
            className="inline-flex items-center gap-1"
            title={t("artifactsCatalog.mirror")}
          >
            <CloudUpload aria-hidden className="size-3.5 shrink-0" />
            {t("artifactsCatalog.mirror")}
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1">
          <CreatorIcon aria-hidden className="size-3.5 shrink-0" />
          {t(
            row.created_by_kind === "agent"
              ? "artifactsCatalog.by.agent"
              : "artifactsCatalog.by.user"
          )}
        </span>
        <span className="font-mono">v{row.current_version}</span>
        {size ? <span>{size}</span> : null}
        {updated ? <span>{updated}</span> : null}
        {row.status === "archived" ? (
          <Badge className="text-[10px]" variant="outline">
            {t("artifactsCatalog.archived")}
          </Badge>
        ) : null}
      </div>
    </button>
  );
}
