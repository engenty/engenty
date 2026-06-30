import type { TeamMemberListItem } from "../api.js";
import type { TeamMembersColumnVisibility } from "../components/team-members-display-dialog.js";

/** Always rendered on cards; excluded from cards view column configurator. */
export const TEAM_MEMBERS_CARD_PINNED_COLUMN: keyof TeamMembersColumnVisibility =
  "fullName";

const CARD_BODY_COLUMN_KEYS: (keyof TeamMembersColumnVisibility)[] = [
  "position",
  "department",
  "location",
  "phone",
  "reportsTo",
];

export interface TeamMemberCardBodyLine {
  key: keyof TeamMembersColumnVisibility;
  value: string;
}

export function teamMembersDisplayColumnsForViewMode<
  T extends { key: keyof TeamMembersColumnVisibility },
>(viewMode: "table" | "cards" | "kanban", columns: T[]): T[] {
  if (viewMode !== "cards") {
    return columns;
  }
  return columns.filter((col) => col.key !== TEAM_MEMBERS_CARD_PINNED_COLUMN);
}

export function teamMemberCardBodyLines(
  member: TeamMemberListItem,
  columnOrder: (keyof TeamMembersColumnVisibility)[],
  columnVisibility: TeamMembersColumnVisibility,
  labels: { noManager: string }
): TeamMemberCardBodyLine[] {
  const valueFor = (key: keyof TeamMembersColumnVisibility): string => {
    switch (key) {
      case "position":
        return member.position || "-";
      case "department":
        return member.department || "-";
      case "location":
        return member.location || "-";
      case "phone":
        return member.phone || "-";
      case "reportsTo":
        return member.reports_to_display_name ?? labels.noManager;
      default:
        return "-";
    }
  };

  const orderedKeys = [
    ...columnOrder.filter((key) => CARD_BODY_COLUMN_KEYS.includes(key)),
    ...CARD_BODY_COLUMN_KEYS.filter((key) => !columnOrder.includes(key)),
  ];

  return orderedKeys
    .filter((key) => columnVisibility[key])
    .map((key) => ({ key, value: valueFor(key) }));
}
