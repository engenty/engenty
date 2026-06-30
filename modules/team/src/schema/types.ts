/**
 * Member type for directory/rights: internal (has employee data), external, contractor.
 * Externals have a profile only; internals also have an employee (HR) row in team-hr.
 */
export type MemberType = "internal" | "external" | "contractor";

/**
 * Profile – shared, directory-level data. All team member types (internal, external, contractor).
 * Visible to tenant users per profile read policy. Auth link: user_id = "logs in as this profile".
 * HR/employment data lives in the team-hr module (module_team.employees), keyed by profile id.
 */
export interface Profile {
  birth_name: string | null;
  created_at: string;
  department: string | null;
  email: string | null;
  first_name: string | null;
  full_name: string;
  /** When set, used as display name instead of formatted parts. */
  full_name_override: string | null;
  id: string;
  initials: string | null;
  last_name: string | null;
  location: string | null;
  member_type: MemberType;
  middle_name: string | null;
  name_prefix: string | null;
  name_suffix: string | null;
  phone: string | null;
  phonetic_name: string | null;
  position: string | null;
  /** Vault key for public profile picture. */
  profile_image_storage_key: string | null;
  scope_id: string;
  tenant_id: string;
  updated_at: string;
  user_id: string | null;
}

export type ProfileInput = Omit<
  Profile,
  "id" | "tenant_id" | "scope_id" | "created_at" | "updated_at"
>;
export type ProfileUpdateInput = Partial<ProfileInput>;

/**
 * Flat list/detail row for the core team module (HTTP responses and repository reads).
 * `id` is the profile id. Directory fields match {@link Profile}; HR fields are NOT part of
 * the core member — they are fetched from team-hr's `/api/team/:id/employee` endpoint.
 */
export interface TeamMember {
  birth_name: string | null;
  created_at: string;
  department: string | null;
  email: string | null;
  first_name: string | null;
  full_name: string;
  full_name_override: string | null;
  /** Profile id (stable identity for routes, contracts, and the employee record). */
  id: string;
  /** External import key for CSV re-import upsert. */
  import_id: string | null;
  initials: string | null;
  /** Last successful CSV import timestamp. */
  last_imported_at: string | null;
  last_name: string | null;
  location: string | null;
  /** Assigned `location` taxonomy term slug for display. */
  location_term?: string | null;
  /** Assigned `location` taxonomy term id (from profile assignments). */
  location_term_id?: string | null;
  member_type: MemberType;
  middle_name: string | null;
  name_prefix: string | null;
  name_suffix: string | null;
  /** Human org node for this profile (module_team.org_nodes). */
  org_node_id?: string | null;
  phone: string | null;
  phonetic_name: string | null;
  position: string | null;
  profile_image_storage_key: string | null;
  /** Resolved manager display name for detail UI. */
  reports_to_display_name?: string | null;
  /** Manager org node id (`reports_to_id` on this member's org node). */
  reports_to_id?: string | null;
  /** Assigned `role` taxonomy term slug for display. */
  role_term?: string | null;
  /** Assigned `role` taxonomy term id (from profile assignments). */
  role_term_id?: string | null;
  scope_id: string;
  tenant_id: string;
  updated_at: string;
  user_id: string | null;
}

export type TeamMemberInput = Omit<
  TeamMember,
  | "id"
  | "tenant_id"
  | "scope_id"
  | "created_at"
  | "updated_at"
  | "member_type"
  | "email"
  | "full_name"
  | "import_id"
  | "last_imported_at"
  | "profile_image_storage_key"
  | "role_term_id"
  | "location_term_id"
  | "role_term"
  | "location_term"
> & {
  /** Legacy quick-create; derived from parts when omitted. */
  full_name?: string;
  member_type?: MemberType;
  email?: string | null;
  import_id?: string | null;
  last_imported_at?: string | null;
  profile_image_storage_key?: string | null;
  /** Taxonomy term id for built-in `role` taxonomy (not a profile column). */
  role_term_id?: string | null;
  /** Taxonomy term id for built-in `location` taxonomy (not a profile column). */
  location_term_id?: string | null;
};

export type TeamMemberUpdateInput = Partial<TeamMemberInput>;

export interface TeamMembersQueryParams {
  group_id?: string;
  location_term_id?: string;
  page?: number;
  pageSize?: number;
  role_term_id?: string;
  search?: string;
  sortBy?: "full_name" | "position" | "department" | "created_at";
  sortOrder?: "asc" | "desc";
}

export interface TeamMembersPaginatedResponse {
  data: TeamMember[];
  page: number;
  pageSize: number;
  total: number;
}
