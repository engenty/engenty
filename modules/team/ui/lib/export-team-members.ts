import type { TeamMemberListItem, TeamMembersQueryParams } from "../api.js";
import { getTeamMembers } from "../api.js";
import type { TeamMembersColumnVisibility } from "../components/team-members-display-dialog.js";

export interface TeamMemberExportColumn {
  getValue: (member: TeamMemberListItem) => string;
  key: string;
  label: string;
}

export type TeamMemberExportColumnScope =
  | "all"
  | {
      visible: {
        columnVisibility: TeamMembersColumnVisibility;
        columnOrder: (keyof TeamMembersColumnVisibility)[];
      };
    };

export function buildTeamMemberExportColumns(
  scope: TeamMemberExportColumnScope,
  labels: Record<keyof TeamMembersColumnVisibility, string> & {
    email: string;
    role: string;
    memberType: string;
    createdAt: string;
  }
): TeamMemberExportColumn[] {
  const displayColumns: Record<
    keyof TeamMembersColumnVisibility,
    TeamMemberExportColumn
  > = {
    avatar: {
      key: "avatar",
      label: labels.avatar,
      getValue: () => "",
    },
    linkedUser: {
      key: "user_id",
      label: labels.linkedUser,
      getValue: (member) => (member.user_id ? "✓" : ""),
    },
    fullName: {
      key: "full_name",
      label: labels.fullName,
      getValue: (member) => member.full_name,
    },
    position: {
      key: "position",
      label: labels.position,
      getValue: (member) => member.position ?? "",
    },
    department: {
      key: "department",
      label: labels.department,
      getValue: (member) => member.department ?? "",
    },
    location: {
      key: "location",
      label: labels.location,
      getValue: (member) => member.location_term ?? member.location ?? "",
    },
    phone: {
      key: "phone",
      label: labels.phone,
      getValue: (member) => member.phone ?? "",
    },
    reportsTo: {
      key: "reports_to_display_name",
      label: labels.reportsTo,
      getValue: (member) => member.reports_to_display_name ?? "",
    },
  };

  const allColumns: TeamMemberExportColumn[] = [
    displayColumns.fullName,
    {
      key: "email",
      label: labels.email,
      getValue: (member) => member.email ?? "",
    },
    displayColumns.position,
    displayColumns.department,
    displayColumns.location,
    displayColumns.phone,
    {
      key: "role_term",
      label: labels.role,
      getValue: (member) => member.role_term ?? "",
    },
    {
      key: "role_term_id",
      label: `${labels.role} ID`,
      getValue: (member) => member.role_term_id ?? "",
    },
    {
      key: "location_term_id",
      label: `${labels.location} ID`,
      getValue: (member) => member.location_term_id ?? "",
    },
    {
      key: "member_type",
      label: labels.memberType,
      getValue: (member) => member.member_type,
    },
    {
      key: "created_at",
      label: labels.createdAt,
      getValue: (member) => member.created_at,
    },
  ];

  if (scope === "all") {
    return allColumns;
  }

  return scope.visible.columnOrder
    .filter((key) => scope.visible.columnVisibility[key] && key !== "avatar")
    .map((key) => displayColumns[key]);
}

function escapeCsvValue(val: string | null | undefined): string {
  if (val == null) {
    return "";
  }
  const value = String(val);
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function teamMembersToExportRows(
  members: TeamMemberListItem[],
  columns: TeamMemberExportColumn[]
): string[][] {
  const header = columns.map((column) => column.label);
  const rows = members.map((member) =>
    columns.map((column) => column.getValue(member))
  );
  return [header, ...rows];
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportTeamMembersAsCsv(
  members: TeamMemberListItem[],
  filename: string,
  columns: TeamMemberExportColumn[]
): void {
  const rows = teamMembersToExportRows(members, columns);
  const csv = rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
  downloadBlob(
    new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }),
    filename
  );
}

export async function exportTeamMembersAsExcel(
  members: TeamMemberListItem[],
  filename: string,
  columns: TeamMemberExportColumn[]
): Promise<void> {
  const rows = teamMembersToExportRows(members, columns);
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  await writeXlsxFile(rows, { sheet: "Team members" }).toFile(filename);
}

const EXPORT_PAGE_SIZE = 1000;

export async function fetchAllTeamMembersForExport(
  params: Omit<TeamMembersQueryParams, "page" | "pageSize">,
  signal?: AbortSignal
): Promise<TeamMemberListItem[]> {
  const firstPage = await getTeamMembers(
    { ...params, page: 1, pageSize: EXPORT_PAGE_SIZE },
    signal
  );
  const members = [...firstPage.data];
  const totalPages = Math.ceil(firstPage.total / EXPORT_PAGE_SIZE);

  for (let page = 2; page <= totalPages; page += 1) {
    const nextPage = await getTeamMembers(
      { ...params, page, pageSize: EXPORT_PAGE_SIZE },
      signal
    );
    members.push(...nextPage.data);
  }

  return members;
}
