import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ListToolbarIconButton,
} from "@engenty/ui-core";
import { Download, FileSpreadsheet, FileText, Printer } from "lucide-react";
import type { ContactListItem } from "../api.js";
import {
  exportContactsAsCsv,
  exportContactsAsExcel,
} from "../lib/export-contacts.js";
import type { ContactsColumnVisibility } from "./contacts-display-dialog.js";

export interface ContactsExportMenuProps {
  baseName?: string;
  columnOrder: (keyof ContactsColumnVisibility)[];
  columnVisibility: ContactsColumnVisibility;
  entities: ContactListItem[];
  exportCsvLabel: string;
  exportLabel: string;
  exportPrintLabel: string;
  exportXlsLabel: string;
}

export function ContactsExportMenu({
  entities,
  columnVisibility,
  columnOrder,
  baseName = `contacts-${new Date().toISOString().slice(0, 10)}`,
  exportLabel,
  exportCsvLabel,
  exportPrintLabel,
  exportXlsLabel,
}: ContactsExportMenuProps) {
  const visibleScope = {
    visible: {
      columnVisibility,
      columnOrder,
    },
  } as const;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <ListToolbarIconButton aria-label={exportLabel} type="button">
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
          onClick={() =>
            exportContactsAsCsv(entities, `${baseName}.csv`, visibleScope)
          }
        >
          <FileText className="mr-2 h-4 w-4" />
          {exportCsvLabel}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            exportContactsAsExcel(entities, `${baseName}.xlsx`, visibleScope)
          }
        >
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          {exportXlsLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
