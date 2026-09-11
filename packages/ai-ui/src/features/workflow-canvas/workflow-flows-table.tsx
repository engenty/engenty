// Table view for the Actions catalog — the other mode: you know which Action
// you want and you are finding it by name in a long list.
import { useTranslation } from "@engenty/i18n/ui";
import {
  cn,
  STICKY_HEADER_CLASS,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@engenty/ui-core";
import { FileTerminal, Workflow } from "lucide-react";
import { formatEngentyActionSource } from "../agents-workspace/workflow-record-utils.js";
import { FlowStatusBadge } from "./workflow-flows-cards.js";
import type { WorkflowCatalogEntry } from "./workflow-flows-state.js";

interface WorkflowLibraryTableProps {
  flows: readonly WorkflowCatalogEntry[];
  onOpen: (flow: WorkflowCatalogEntry) => void;
}

export function WorkflowLibraryTable({
  flows,
  onOpen,
}: WorkflowLibraryTableProps) {
  const { t } = useTranslation("ai-ui");

  return (
    // `table-fixed`: without it a long description sets the column width and
    // pushes Subject and Status off the right edge.
    <Table className="mb-2 w-full table-fixed" noWrapper>
      <TableHeader className={STICKY_HEADER_CLASS}>
        <TableRow className="group hover:bg-transparent [&>th:first-child]:pl-4">
          <TableHead>{t("workflows.columnAction")}</TableHead>
          <TableHead className="w-[180px]">
            {t("workflows.columnSource")}
          </TableHead>
          <TableHead className="w-[110px]">
            {t("workflows.columnStatus")}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody
        className={cn(
          "ui-card-raised",
          "[&>tr:hover>td]:bg-muted/50 [&>tr>td]:bg-card",
          "[&>tr>td:first-child]:pl-4"
        )}
      >
        {flows.map((flow) => (
          <TableRow
            className="cursor-pointer"
            key={flow.id}
            onClick={() => onOpen(flow)}
          >
            <TableCell>
              <div className="flex min-w-0 items-center gap-2">
                {/* The icon says where the runnable was written: a file or the
                    canvas. Same list, two origins. */}
                {flow.source === "module" ? (
                  <FileTerminal
                    aria-hidden
                    className="size-3.5 shrink-0 text-muted-foreground"
                  />
                ) : (
                  <Workflow
                    aria-hidden
                    className="size-3.5 shrink-0 text-muted-foreground"
                  />
                )}
                <div className="min-w-0">
                  <p className="truncate font-medium">{flow.name}</p>
                  {flow.description ? (
                    <p className="truncate text-muted-foreground text-xs">
                      {flow.description}
                    </p>
                  ) : null}
                </div>
              </div>
            </TableCell>
            <TableCell className="truncate text-muted-foreground text-xs">
              {flow.moduleId
                ? formatEngentyActionSource(flow.moduleId)
                : t("workflows.source.authored")}
            </TableCell>
            <TableCell>
              <FlowStatusBadge flow={flow} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
