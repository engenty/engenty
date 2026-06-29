import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
} from "@engenty/ui-core";
import { formatDistanceToNow } from "date-fns";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { AuditLogEvent } from "../types.js";

interface AuditLogEntryProps {
  labelMetadata?: string;
  log: AuditLogEvent;
}

const typeColors: Record<string, string> = {
  trace: "bg-muted text-muted-foreground",
  debug: "bg-muted text-muted-foreground",
  info: "bg-blue-500/10 text-blue-700 dark:text-blue-200 dark:bg-blue-500/20",
  warn: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-200 dark:bg-yellow-500/20",
  error: "bg-red-500/10 text-red-700 dark:text-red-200 dark:bg-red-500/20",
  fatal: "bg-red-600/20 text-red-800 dark:text-red-200",
  executed:
    "bg-blue-500/10 text-blue-700 dark:text-blue-200 dark:bg-blue-500/20",
  allow:
    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200 dark:bg-emerald-500/20",
  deny: "bg-red-500/10 text-red-700 dark:text-red-200 dark:bg-red-500/20",
  rejected: "bg-red-500/10 text-red-700 dark:text-red-200 dark:bg-red-500/20",
  require_approval:
    "bg-amber-500/10 text-amber-700 dark:text-amber-200 dark:bg-amber-500/20",
  created:
    "bg-slate-500/10 text-slate-700 dark:text-slate-200 dark:bg-slate-500/20",
  decided:
    "bg-slate-500/10 text-slate-700 dark:text-slate-200 dark:bg-slate-500/20",
  completed:
    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200 dark:bg-emerald-500/20",
  started:
    "bg-blue-500/10 text-blue-700 dark:text-blue-200 dark:bg-blue-500/20",
  rate_limited:
    "bg-amber-500/10 text-amber-700 dark:text-amber-200 dark:bg-amber-500/20",
  default: "bg-muted text-muted-foreground",
};

function getTypeColor(type: string): string {
  const key = type.split(".").pop() ?? type;
  return typeColors[key] ?? typeColors.default;
}

export function AuditLogEntry({
  log,
  labelMetadata = "Metadata",
}: AuditLogEntryProps) {
  const [expanded, setExpanded] = useState(false);
  const detail = log.detail ?? {};
  const hasMetadata = Object.keys(detail).length > 0;

  const userInitials =
    log.user?.full_name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) ?? "?";

  const formattedTime = formatDistanceToNow(new Date(log.timestamp), {
    addSuffix: true,
  });
  const absoluteTime = new Date(log.timestamp).toLocaleString();

  const description =
    typeof detail?.message === "string" ? detail.message : undefined;

  const sourceLabel =
    log.source_component ?? log.source_module_id ?? log.source_kind ?? null;

  return (
    <div className="grid grid-cols-[7rem_6rem_2.5rem_1fr_auto] items-start gap-4 border-border/50 border-b px-4 py-3 hover:bg-muted/30">
      <div
        className="shrink-0 font-mono text-muted-foreground text-xs tabular-nums"
        title={absoluteTime}
      >
        {formattedTime}
      </div>

      <Badge
        className={`h-5 w-fit min-w-[5rem] justify-center px-2 font-medium text-xxs uppercase ${getTypeColor(log.type)}`}
        variant="secondary"
      >
        {log.type.split(".").pop() ?? log.type}
      </Badge>

      <Avatar className="h-6 w-6 shrink-0">
        <AvatarImage src={log.user?.avatar_url ?? undefined} />
        <AvatarFallback className="text-xxs">{userInitials}</AvatarFallback>
      </Avatar>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-foreground text-sm">
            {log.type}
          </span>
          {description && (
            <>
              <span className="text-muted-foreground">—</span>
              <span className="text-muted-foreground text-sm">
                {description}
              </span>
            </>
          )}
          {log.module_id && (
            <Badge
              className="h-5 shrink-0 font-normal text-xxs"
              variant="outline"
            >
              {log.module_id}
            </Badge>
          )}
        </div>

        {hasMetadata && (
          <div className="mt-2">
            <Button
              className="h-6 px-1.5 text-muted-foreground text-xs hover:text-foreground"
              onClick={() => setExpanded(!expanded)}
              size="sm"
              variant="ghost"
            >
              {expanded ? (
                <ChevronDown className="mr-1.5 h-3 w-3" />
              ) : (
                <ChevronRight className="mr-1.5 h-3 w-3" />
              )}
              {labelMetadata}
            </Button>
            {expanded && (
              <pre className="mt-2 overflow-x-auto rounded-md bg-muted/80 p-3 font-mono text-xs">
                {JSON.stringify(detail, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>

      <span className="shrink-0 font-mono text-muted-foreground text-xxs">
        {sourceLabel ?? "—"}
      </span>
    </div>
  );
}
