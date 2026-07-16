// Grouped card view for the tenant-wide artifacts admin list. Cards are
// grouped by scope (thread / task / project / goal) — the boundary that
// decides who can see the artifact — and each card opens the artifact.

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
  Boxes,
  CloudUpload,
  Database,
  FileStack,
  HardDrive,
  ListChecks,
  MessagesSquare,
  Target,
  User,
  Users,
} from "lucide-react";
import { type ComponentType, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import type { AdminArtifactRow } from "../../artifacts/artifacts-api";
import { buildArtifactDetailPath } from "../agents-workspace/agent-workspace-paths";
import { formatRelativeDate } from "../agents-workspace/date-format";
import {
  type ArtifactScopeGroup,
  formatArtifactSize,
  shortArtifactId,
} from "./artifacts-catalog-state";

type IconType = ComponentType<{
  "aria-hidden"?: boolean;
  className?: string;
}>;

const SCOPE_ICON: Record<string, IconType> = {
  goal: Target,
  project: Boxes,
  task: ListChecks,
  thread: MessagesSquare,
};

function scopeText(t: (key: string) => string, scopeType: string): string {
  const key = `artifactsCatalog.scope.${scopeType}`;
  const translated = t(key);
  return translated === key ? scopeType : translated;
}

function scopeAudience(t: (key: string) => string, scopeType: string): string {
  const key = `artifactsCatalog.audience.${scopeType}`;
  const translated = t(key);
  return translated === key ? "" : translated;
}

interface StorageDescriptor {
  Icon: IconType;
  label: string;
}

function describeStorage(
  t: (key: string) => string,
  storageId: string
): StorageDescriptor {
  if (storageId === "inline") {
    return {
      Icon: Database,
      label: t("artifactsCatalog.storage.inline.label"),
    };
  }
  if (storageId === "blob") {
    return { Icon: HardDrive, label: t("artifactsCatalog.storage.blob.label") };
  }
  return { Icon: HardDrive, label: storageId };
}

interface ArtifactsCatalogCardsProps {
  groups: ArtifactScopeGroup[];
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
        const ScopeIcon = SCOPE_ICON[group.id] ?? FileStack;
        const audience = scopeAudience(t, group.id);
        return (
          <Fragment key={group.id}>
            <AdminListGroupHeader
              count={groupCountLabel(group.rows.length)}
              onToggle={() => onToggleGroup(group.id)}
              open={open}
              toggleLabel={t("artifactsCatalog.toggleGroup")}
            >
              <span className="flex min-w-0 items-center gap-2">
                <ScopeIcon
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <AdminListGroupPill>
                  {scopeText(t, group.id)}
                </AdminListGroupPill>
                {audience ? (
                  <span className="flex min-w-0 items-center gap-1 text-muted-foreground text-xs">
                    <Users aria-hidden className="size-3 shrink-0" />
                    <span className="truncate">{audience}</span>
                  </span>
                ) : null}
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
      // Pass the row so the detail header has the scope/storage facts without a
      // second round-trip; the detail page still works on a cold deep-link.
      onClick={() =>
        navigate(buildArtifactDetailPath(row.id), { state: { row } })
      }
      type="button"
    >
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

      {/* Scope id — the concrete home within this group's scope type */}
      <p
        className="mt-1 truncate font-mono text-muted-foreground text-xs"
        title={row.scope_id}
      >
        {shortArtifactId(row.scope_id)}
      </p>

      {/* Footer: physical storage (secondary) + provenance + version + status */}
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
