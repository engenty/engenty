import type { ContactListItem } from "../api.js";
import type { ContactsColumnVisibility } from "../components/contacts-display-dialog.js";

const ALL_COLUMNS = [
  { key: "display_name", label: "Display Name" },
  { key: "first_name", label: "First name" },
  { key: "last_name", label: "Last name" },
  { key: "name_prefix", label: "Title (prefix)" },
  { key: "middle_name", label: "Middle name" },
  { key: "name_suffix", label: "Title (suffix)" },
  { key: "phonetic_name", label: "Phonetic name" },
  { key: "birth_name", label: "Birth name" },
  { key: "display_name_override", label: "Custom display name" },
  { key: "legal_name", label: "Legal Name" },
  { key: "contact_name", label: "Contact Name" },
  { key: "type", label: "Type" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "address_street", label: "Street" },
  { key: "address_zip", label: "Postal Code" },
  { key: "address_city", label: "City" },
  { key: "address_country", label: "Country" },
  { key: "roles", label: "Roles" },
  { key: "reference_id", label: "Reference ID" },
] as const;

const DISPLAY_TO_EXPORT: Record<
  keyof ContactsColumnVisibility,
  { key: string; label: string; getValue: (e: ContactListItem) => string }
> = {
  legalName: {
    key: "legal_name",
    label: "Legal Name",
    getValue: (e) => e.legal_name || e.display_name || "",
  },
  displayName: {
    key: "display_name",
    label: "Display Name",
    getValue: (e) => e.display_name || "",
  },
  contactName: {
    key: "contact_name",
    label: "Contact Name",
    getValue: (e) => e.contact_name || "",
  },
  createdAt: {
    key: "created_at",
    label: "Created",
    getValue: (e) => e.created_at || "",
  },
  email: {
    key: "email",
    label: "Email",
    getValue: (e) => e.email || "",
  },
  phone: {
    key: "phone",
    label: "Phone",
    getValue: (e) => e.phone || "",
  },
  location: {
    key: "location",
    label: "Location",
    getValue: (e) =>
      [e.address_zip, e.address_city, e.address_country]
        .filter(Boolean)
        .join(", ") || "",
  },
  roles: {
    key: "roles",
    label: "Roles",
    getValue: (e) => (e.roles ?? []).join(", "),
  },
};

function getVisibleColumns(
  columnVisibility: ContactsColumnVisibility,
  columnOrder: (keyof ContactsColumnVisibility)[]
): { key: string; label: string; getValue: (e: ContactListItem) => string }[] {
  return columnOrder
    .filter((k) => columnVisibility[k])
    .map((k) => DISPLAY_TO_EXPORT[k]);
}

function escapeCsvValue(val: string | null | undefined): string {
  if (val == null) {
    return "";
  }
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

type ColumnDef =
  | { key: string; label: string }
  | { key: string; label: string; getValue: (e: ContactListItem) => string };

function entitiesToRows(
  entities: ContactListItem[],
  columns: ColumnDef[]
): string[][] {
  const header = columns.map((c) => c.label);
  const rows = entities.map((e) =>
    columns.map((c) => {
      if ("getValue" in c) {
        return c.getValue(e);
      }
      if (c.key === "roles") {
        return (e.roles ?? []).join(", ");
      }
      const v = (e as Record<string, unknown>)[c.key];
      return v == null ? "" : String(v);
    })
  );
  return [header, ...rows];
}

export type ExportColumnScope =
  | "all"
  | {
      visible: {
        columnVisibility: ContactsColumnVisibility;
        columnOrder: (keyof ContactsColumnVisibility)[];
      };
    };

function getColumns(scope: ExportColumnScope): ColumnDef[] {
  if (scope === "all") {
    return [...ALL_COLUMNS];
  }
  return getVisibleColumns(
    scope.visible.columnVisibility,
    scope.visible.columnOrder
  );
}

export function exportContactsAsCsv(
  entities: ContactListItem[],
  filename = "contacts.csv",
  scope: ExportColumnScope = "all"
): void {
  const columns = getColumns(scope);
  const rows = entitiesToRows(entities, columns);
  const csv = rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportContactsAsExcel(
  entities: ContactListItem[],
  filename = "contacts.xlsx",
  scope: ExportColumnScope = "all"
): Promise<void> {
  const columns = getColumns(scope);
  const rows = entitiesToRows(entities, columns);
  const { default: writeXlsxFile } = await import("write-excel-file/browser");

  await writeXlsxFile(rows, { sheet: "Contacts" }).toFile(filename);
}
