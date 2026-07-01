import { useTranslation } from "@engenty/i18n/ui";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@engenty/ui-core";
import { ChevronDown } from "lucide-react";
import {
  type KbSourceRunItemLog,
  parseRunItemLogs,
} from "../../src/sources/source-run-item-log.js";

function runItemLogLabelKey(outcome: KbSourceRunItemLog["outcome"]): string {
  switch (outcome) {
    case "created":
      return "sources.run_item_created";
    case "updated":
      return "sources.run_item_updated";
    case "skipped_ignored":
      return "sources.run_item_skipped_ignored";
    case "skipped_unchanged":
      return "sources.run_item_skipped_unchanged";
    case "failed":
      return "sources.run_item_failed";
    default:
      return "sources.run_item_failed";
  }
}

export function SourceDetailRunItemLogs({
  metadata,
}: {
  metadata: Record<string, unknown>;
}) {
  const { t } = useTranslation("kb");
  const itemLogs = parseRunItemLogs(metadata);
  if (itemLogs.length === 0) {
    return null;
  }

  return (
    <Collapsible className="w-full">
      <CollapsibleTrigger className="group flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground">
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
        {t("sources.run_item_logs_toggle", { count: itemLogs.length })}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 overflow-x-auto rounded-md border bg-background/80">
        <Table className="w-full min-w-full" noWrapper>
          <TableHeader>
            <TableRow>
              <TableHead className="h-8">
                {t("sources.run_item_title")}
              </TableHead>
              <TableHead className="h-8">
                {t("sources.run_item_outcome")}
              </TableHead>
              <TableHead className="h-8">
                {t("sources.run_item_message")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itemLogs.map((log) => (
              <TableRow key={`${log.item_key}:${log.outcome}`}>
                <TableCell className="min-w-[12rem] align-top text-xs">
                  <div
                    className="break-all font-medium"
                    title={log.title ?? log.item_key}
                  >
                    {log.title ?? log.item_key}
                  </div>
                  {log.source_url ? (
                    <div
                      className="break-all text-muted-foreground"
                      title={log.source_url}
                    >
                      {log.source_url}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell
                  className={cn(
                    "align-top text-xs",
                    log.outcome === "failed" && "font-medium text-destructive"
                  )}
                >
                  {t(runItemLogLabelKey(log.outcome))}
                </TableCell>
                <TableCell className="min-w-[16rem] align-top text-muted-foreground text-xs leading-snug">
                  <span className="whitespace-pre-wrap break-words">
                    {log.message ?? "—"}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CollapsibleContent>
    </Collapsible>
  );
}
