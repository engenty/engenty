// Grouped card view for the tenant-wide artifacts admin list. Cards are
// informational (no per-artifact admin detail route yet); the emphasis is on
// making *where* each artifact lives obvious — physical storage, logical
// scope, and any external mirror.

import { useTranslation } from "@engenty/i18n/ui";
import {
  AdminListGroupHeader,
  AdminListGroupPill,
  adminListCardsGridClassName,
  Badge,
  cn,
} from "@engenty/ui-core";
import {
  Bot,
  CloudUpload,
  Database,
  FileStack,
  HardDrive,
  User,
} from "lucide-react";
import { type ComponentType, Fragment } from "react";
import type { AdminArtifactRow } from "../../artifacts/artifacts-api";
import { formatRelativeDate } from "../agents-workspace/date-format";
import {
  type ArtifactStorageGroup,
  formatArtifactSize,
  shortArtifactId,
} from "./artifacts-catalog-state";

type IconType = ComponentType<{
  "aria-hidden"?: boolean;
  className?: string;
}>;

interface StorageDescriptor {
  Icon: IconType;
  label: string;
  where: string;
}

function describeStorage(
  t: (key: string) => string,
  storageId: string
): StorageDescriptor {
  if (storageId === "inline") {
    return {
      Icon: Database,
      label: t("artifactsCatalog.storage.inline.label"),
      where: t("artifactsCatalog.storage.inline.where"),
    };
  }
  if (storageId === "blob") {
    return {
      Icon: HardDrive,
      label: t("artifactsCatalog.storage.blob.label"),
      where: t("artifactsCatalog.storage.blob.where"),
    };
  }
  return {
    Icon: HardDrive,
    label: storageId,
    where: t("artifactsCatalog.storage.unknown.where"),
  };
}

function scopeLabel(t: (key: string) => string, scopeType: string): string {
  const key = `artifactsCatalog.scope.${scopeType}`;
  const translated = t(key);
  return translated === key ? scopeType : translated;
}

interface ArtifactsCatalogCardsProps {
  groups: ArtifactStorageGroup[];
  isGroupOpen: (id: string) => boolean;
  onToggleGroup: (id: string) => void;
}

export function ArtifactsCatalogCards({
  groups,
  isGroupOpen,
  onToggleGroup,
}: ArtifactsCatalogCardsProps) {
  const { t } = useTranslation("ai-ui");

  const groupCountLabel = (count: number) =>
    `${count} ${
      count === 1
        ? t("artifactsCatalog.groupCountSingular")
        : t("artifactsCatalog.groupCountPlural")
    }`;

  return (
    <div className="flex flex-col gap-2">
      {groups.map((group) => {
        const open = isGroupOpen(group.id);
        const storage = describeStorage(t, group.id);
        return (
          <Fragment key={group.id}>
            <AdminListGroupHeader
              count={groupCountLabel(group.rows.length)}
              onToggle={() => onToggleGroup(group.id)}
              open={open}
              toggleLabel={t("artifactsCatalog.toggleGroup")}
            >
              <span className="flex min-w-0 items-center gap-2">
                <storage.Icon
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <AdminListGroupPill>{storage.label}</AdminListGroupPill>
                <span className="truncate font-mono text-muted-foreground text-xs">
                  {storage.where}
                </span>
              </span>
            </AdminListGroupHeader>
            {open ? (
              <div
                className={cn(adminListCardsGridClassName("normal"), "mb-2")}
              >
                {group.rows.map((row) => (
                  <ArtifactCard
                    key={row.id}
                    row={row}
                    scopeText={scopeLabel(t, row.scope_type)}
                    storage={storage}
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
  scopeText,
  storage,
  t,
}: {
  row: AdminArtifactRow;
  scopeText: string;
  storage: StorageDescriptor;
  t: (key: string) => string;
}) {
  const size = formatArtifactSize(row.size_bytes);
  const mirror = row.metadata.external_mirror;
  const CreatorIcon = row.created_by_kind === "agent" ? Bot : User;
  const updated = formatRelativeDate(row.updated_at);

  return (
    <div className="ui-canvas-elevated flex flex-col rounded-lg bg-card p-3">
      {/* Title + type */}
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

      {/* Where it lives: physical storage + logical scope */}
      <div className="mt-3 flex flex-col gap-1.5 rounded-md bg-muted/40 p-2">
        <div className="flex items-center gap-1.5 text-xs">
          <storage.Icon
            aria-hidden
            className="size-3.5 shrink-0 text-muted-foreground"
          />
          <span className="font-medium">{storage.label}</span>
          <span className="truncate font-mono text-muted-foreground">
            {storage.where}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <Badge className="shrink-0 text-[10px]" variant="outline">
            {scopeText}
          </Badge>
          <span
            className="truncate font-mono text-muted-foreground"
            title={row.scope_id}
          >
            {shortArtifactId(row.scope_id)}
          </span>
        </div>
        {mirror ? (
          <div className="flex items-center gap-1.5 text-xs">
            <CloudUpload
              aria-hidden
              className="size-3.5 shrink-0 text-muted-foreground"
            />
            <span className="text-muted-foreground">
              {t("artifactsCatalog.mirror")}
            </span>
            <span
              className="truncate font-mono text-muted-foreground"
              title={mirror.connection_id}
            >
              {shortArtifactId(mirror.connection_id)}
            </span>
          </div>
        ) : null}
      </div>

      {/* Footer: provenance + version + status */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
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
    </div>
  );
}
