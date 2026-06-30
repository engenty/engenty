import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ListToolbarIconButton,
} from "@engenty/ui-core";
import { Download, FileSpreadsheet, FileText, Printer } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { TeamMembersQueryParams } from "../api.js";
import {
  buildTeamMemberExportColumns,
  exportTeamMembersAsCsv,
  exportTeamMembersAsExcel,
  fetchAllTeamMembersForExport,
} from "../lib/export-team-members.js";
import type { TeamMembersColumnVisibility } from "./team-members-display-dialog.js";

export interface TeamMembersExportMenuProps {
  baseName?: string;
  columnOrder: (keyof TeamMembersColumnVisibility)[];
  columnVisibility: TeamMembersColumnVisibility;
  exportColumnLabels: Record<keyof TeamMembersColumnVisibility, string> & {
    email: string;
    role: string;
    memberType: string;
    createdAt: string;
  };
  exportCsvLabel: string;
  exportFailedLabel: string;
  exportLabel: string;
  exportPrintLabel: string;
  exportXlsLabel: string;
  listParams: Omit<TeamMembersQueryParams, "page" | "pageSize">;
}

export function TeamMembersExportMenu({
  baseName = `team-members-${new Date().toISOString().slice(0, 10)}`,
  columnOrder,
  columnVisibility,
  exportColumnLabels,
  exportCsvLabel,
  exportFailedLabel,
  exportLabel,
  exportPrintLabel,
  exportXlsLabel,
  listParams,
}: TeamMembersExportMenuProps) {
  const [exporting, setExporting] = useState(false);

  const runExport = useCallback(
    async (format: "csv" | "xlsx") => {
      if (exporting) {
        return;
      }
      setExporting(true);
      try {
        const members = await fetchAllTeamMembersForExport(listParams);
        const columns = buildTeamMemberExportColumns(
          { visible: { columnVisibility, columnOrder } },
          exportColumnLabels
        );
        if (format === "csv") {
          exportTeamMembersAsCsv(members, `${baseName}.csv`, columns);
          return;
        }
        await exportTeamMembersAsExcel(members, `${baseName}.xlsx`, columns);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : exportFailedLabel);
      } finally {
        setExporting(false);
      }
    },
    [
      baseName,
      columnOrder,
      columnVisibility,
      exportColumnLabels,
      exportFailedLabel,
      exporting,
      listParams,
    ]
  );

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <ListToolbarIconButton
          aria-label={exportLabel}
          disabled={exporting}
          type="button"
        >
          <Download />
        </ListToolbarIconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => {
            window.print();
          }}
        >
          <Printer className="mr-2 h-4 w-4" />
          {exportPrintLabel}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={exporting}
          onClick={() => {
            void runExport("csv");
          }}
        >
          <FileText className="mr-2 h-4 w-4" />
          {exportCsvLabel}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={exporting}
          onClick={() => {
            void runExport("xlsx");
          }}
        >
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          {exportXlsLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
