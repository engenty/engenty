import type {
  TeamMembersColumnVisibility,
  TeamMembersSortColumn,
} from "../components/team-members-display-dialog.js";

/** Defaults for team members list display prefs (`useListDisplayState`). */
export const TEAM_MEMBERS_LIST_DISPLAY_DEFAULTS = {
  viewMode: "cards" as const,
  tableSize: "normal" as const,
  pageSize: 25 as const,
  sortBy: "full_name" as TeamMembersSortColumn,
  sortOrder: "asc" as const,
  columnVisibility: {
    avatar: true,
    linkedUser: true,
    fullName: true,
    position: true,
    department: true,
    location: true,
    phone: true,
    reportsTo: false,
  } satisfies TeamMembersColumnVisibility,
  columnOrder: [
    "avatar",
    "linkedUser",
    "fullName",
    "position",
    "department",
    "location",
    "phone",
    "reportsTo",
  ] as (keyof TeamMembersColumnVisibility)[],
};
