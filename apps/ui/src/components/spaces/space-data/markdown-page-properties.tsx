/**
 * Compact Notion-style metadata under a markdown artifact title.
 */
import { useQuery } from "@engenty/query-client";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import {
  Clock,
  FilePenLine,
  FileText,
  Folder,
  Hash,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { getSpaceArtifacts } from "@/lib/api/space-drive-client";
import { spaceDriveKeys } from "@/lib/space-drive-queries";

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function formatRelative(value: string | undefined, locale: string): string {
  if (!value) {
    return "—";
  }
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return value;
  }
  const delta = timestamp - Date.now();
  const absolute = Math.abs(delta);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (absolute < MINUTE_MS) {
    return formatter.format(Math.round(delta / SECOND_MS), "second");
  }
  if (absolute < HOUR_MS) {
    return formatter.format(Math.round(delta / MINUTE_MS), "minute");
  }
  if (absolute < DAY_MS) {
    return formatter.format(Math.round(delta / HOUR_MS), "hour");
  }
  return formatter.format(Math.round(delta / DAY_MS), "day");
}

function formatAbsolute(value: string | undefined, locale: string): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function PropertyRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="group/row flex min-h-6 items-center gap-2 rounded-md py-0.5 hover:bg-muted/40">
      <div className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <span className="w-36 shrink-0 text-muted-foreground text-sm leading-none">
        {label}
      </span>
      <div className="flex min-h-6 min-w-0 flex-1 items-center text-foreground text-sm leading-none">
        {value}
      </div>
    </div>
  );
}

function ActorSuffix({
  actorId,
  currentUserId,
  kind,
  youLabel,
  agentLabel,
}: {
  actorId?: string | null;
  agentLabel: string;
  currentUserId: string | null;
  kind?: "agent" | "user";
  youLabel: string;
}) {
  if (kind === "agent") {
    return <span className="text-muted-foreground"> · {agentLabel}</span>;
  }
  if (actorId && currentUserId && actorId === currentUserId) {
    return <span className="text-muted-foreground"> · {youLabel}</span>;
  }
  return null;
}

export function MarkdownPageProperties({
  createdAt,
  createdBy,
  createdByKind,
  labels,
  locale,
  parentId,
  spaceId,
  type,
  updatedAt,
  updatedBy,
  updatedByKind,
  version,
}: {
  createdAt?: string;
  createdBy?: string | null;
  createdByKind?: "agent" | "user";
  labels: {
    agent: string;
    created: string;
    lastEdited: string;
    parent: string;
    root: string;
    type: string;
    typeMarkdown: string;
    version: string;
    you: string;
  };
  locale: string;
  parentId?: string | null;
  spaceId?: string | null;
  type: string;
  updatedAt?: string;
  updatedBy?: string | null;
  updatedByKind?: "agent" | "user";
  version: number;
}) {
  const { currentUserId } = useWorkspaceContext();
  const artifactsQuery = useQuery({
    enabled: Boolean(spaceId && parentId),
    queryFn: ({ signal }) => getSpaceArtifacts(spaceId ?? "", signal),
    queryKey: spaceDriveKeys.artifacts(spaceId ?? ""),
  });
  const parentTitle =
    artifactsQuery.data?.find((row) => row.id === parentId)?.title ?? null;
  const typeLabel = type === "markdown" ? labels.typeMarkdown : type;

  return (
    <div className="space-y-0.5">
      <PropertyRow
        icon={FilePenLine}
        label={labels.lastEdited}
        value={
          <span title={formatAbsolute(updatedAt, locale)}>
            {formatRelative(updatedAt, locale)}
            <ActorSuffix
              actorId={updatedBy}
              agentLabel={labels.agent}
              currentUserId={currentUserId}
              kind={updatedByKind}
              youLabel={labels.you}
            />
          </span>
        }
      />
      <PropertyRow
        icon={Clock}
        label={labels.created}
        value={
          <span title={formatAbsolute(createdAt, locale)}>
            {formatRelative(createdAt, locale)}
            <ActorSuffix
              actorId={createdBy}
              agentLabel={labels.agent}
              currentUserId={currentUserId}
              kind={createdByKind}
              youLabel={labels.you}
            />
          </span>
        }
      />
      <PropertyRow
        icon={Folder}
        label={labels.parent}
        value={
          parentId ? (
            (parentTitle ?? parentId)
          ) : (
            <span className="text-muted-foreground">{labels.root}</span>
          )
        }
      />
      <PropertyRow icon={FileText} label={labels.type} value={typeLabel} />
      <PropertyRow icon={Hash} label={labels.version} value={`v${version}`} />
    </div>
  );
}
