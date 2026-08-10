import { requestApiEnvelope, requestApiJson } from "@engenty/api-client";

export type MemberType = "internal" | "external" | "contractor";

/**
 * Core team member (directory profile). HR/employment fields are NOT part of this
 * type — they live in the team-hr module and are fetched from `/api/team/:id/employee`.
 */
export interface TeamMemberListItem {
  birth_name: string | null;
  created_at: string;
  department: string | null;
  email: string | null;
  first_name: string | null;
  full_name: string;
  full_name_override: string | null;
  id: string;
  import_id: string | null;
  initials: string | null;
  last_imported_at: string | null;
  last_name: string | null;
  location: string | null;
  location_term?: string | null;
  location_term_id?: string | null;
  member_type: MemberType;
  middle_name: string | null;
  name_prefix: string | null;
  name_suffix: string | null;
  org_node_id?: string | null;
  phone: string | null;
  phonetic_name: string | null;
  position: string | null;
  profile_image_storage_key?: string | null;
  reports_to_display_name?: string | null;
  reports_to_id?: string | null;
  role_term?: string | null;
  role_term_id?: string | null;
  scope_id: string;
  tenant_id: string;
  updated_at: string;
  user_id: string | null;
}

export type TeamMemberCreateInput = Omit<
  TeamMemberListItem,
  | "id"
  | "tenant_id"
  | "scope_id"
  | "created_at"
  | "updated_at"
  | "member_type"
  | "import_id"
  | "last_imported_at"
> & {
  member_type?: MemberType;
  import_id?: string | null;
  last_imported_at?: string | null;
  invite_email?: string;
  invite_password?: string;
  invite_role?: "admin" | "member";
  role_term_id?: string | null;
  location_term_id?: string | null;
};

export type TeamMemberUpdateInput = Partial<TeamMemberCreateInput>;

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
  data: TeamMemberListItem[];
  page: number;
  pageSize: number;
  total: number;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  return await requestApiJson<T>(path, init);
}

function buildQuery(params: TeamMembersQueryParams): string {
  const searchParams = new URLSearchParams();
  if (params.page) {
    searchParams.set("page", String(params.page));
  }
  if (params.pageSize) {
    searchParams.set("pageSize", String(params.pageSize));
  }
  if (params.sortBy) {
    searchParams.set("sortBy", params.sortBy);
  }
  if (params.sortOrder) {
    searchParams.set("sortOrder", params.sortOrder);
  }
  if (params.search?.trim()) {
    searchParams.set("search", params.search.trim());
  }
  if (params.role_term_id) {
    searchParams.set("role_term_id", params.role_term_id);
  }
  if (params.location_term_id) {
    searchParams.set("location_term_id", params.location_term_id);
  }
  if (params.group_id) {
    searchParams.set("group_id", params.group_id);
  }
  const query = searchParams.toString();
  return query.length > 0 ? `?${query}` : "";
}

export async function getTeamMembers(
  params: TeamMembersQueryParams = {},
  signal?: AbortSignal
) {
  const query = buildQuery(params);
  const response = await requestApiEnvelope<
    TeamMemberListItem[],
    { page: number; pageSize: number; total: number }
  >(`/api/team${query}`, {
    method: "GET",
    signal,
  });
  return {
    data: response.data,
    page: response.meta?.page ?? params.page ?? 1,
    pageSize:
      response.meta?.pageSize ?? params.pageSize ?? response.data.length,
    total: response.meta?.total ?? response.data.length,
  } satisfies TeamMembersPaginatedResponse;
}

export async function getTeamMember(id: string, signal?: AbortSignal) {
  return await request<TeamMemberListItem>(`/api/team/${id}`, {
    method: "GET",
    signal,
  });
}

export async function createTeamMember(input: TeamMemberCreateInput) {
  return await request<TeamMemberListItem>("/api/team", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateTeamMember(
  id: string,
  patch: TeamMemberUpdateInput
) {
  return await request<TeamMemberListItem>(`/api/team/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteTeamMember(id: string) {
  return await request<{ ok: true; id: string }>(`/api/team/${id}`, {
    method: "DELETE",
  });
}

export interface TeamTaxonomy {
  builtin: string | null;
  cardinality: string;
  config: Record<string, unknown>;
  deletable: boolean;
  filterable: boolean;
  label: string;
  slug: string;
  sort_order: number;
  supports_hierarchy: boolean;
  supports_order: boolean;
  target: "profile" | "group";
}

export interface TeamTaxonomyTermUpsertInput {
  id?: string;
  label: string;
  parent_term_id?: string | null;
  sort_order: number;
  term_slug: string;
}

export interface TeamTaxonomyTerm {
  id: string;
  label: string;
  parent_term_id: string | null;
  sort_order: number;
  term_slug: string;
}

export interface TeamSettingsPayload {
  agent_role_label_overrides: Record<string, string>;
  taxonomies: TeamTaxonomy[];
  termsByTaxonomy: Record<string, TeamTaxonomyTerm[] | unknown[]>;
}

export async function getTeamSettings(signal?: AbortSignal) {
  return requestApiJson<TeamSettingsPayload>("/api/team/settings", {
    method: "GET",
    signal,
  });
}

export async function putTaxonomyTerms(
  taxonomySlug: string,
  terms: TeamTaxonomyTermUpsertInput[]
) {
  return requestApiJson<TeamTaxonomyTerm[]>(
    `/api/team/taxonomies/${encodeURIComponent(taxonomySlug)}/terms`,
    {
      method: "PUT",
      body: JSON.stringify(terms),
    }
  );
}

export interface TeamTaxonomyCreateInput {
  cardinality?: "single" | "multiple";
  config?: Record<string, unknown>;
  filterable?: boolean;
  label: string;
  slug: string;
  supports_hierarchy?: boolean;
  supports_order?: boolean;
  target: "profile" | "group";
}

export async function createTaxonomy(input: TeamTaxonomyCreateInput) {
  return requestApiJson<TeamTaxonomy>("/api/team/taxonomies", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface TeamTaxonomyPatchInput {
  cardinality?: "single" | "multiple";
  config?: Record<string, unknown>;
  filterable?: boolean;
  label?: string;
  supports_hierarchy?: boolean;
  supports_order?: boolean;
}

export async function patchTaxonomy(
  slug: string,
  patch: TeamTaxonomyPatchInput
) {
  return requestApiJson<TeamTaxonomy>(
    `/api/team/taxonomies/${encodeURIComponent(slug)}`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    }
  );
}

export async function deleteTaxonomy(slug: string) {
  return requestApiJson<{ ok: true }>(
    `/api/team/taxonomies/${encodeURIComponent(slug)}`,
    { method: "DELETE" }
  );
}

export interface OrgTreeNode {
  agent_id: string | null;
  display_name: string;
  display_title: string | null;
  icon: string | null;
  id: string;
  kind: "human" | "agent";
  profile_id: string | null;
  reports: OrgTreeNode[];
  role_label: string | null;
  status: string | null;
}

export async function getTeamOrgTree(signal?: AbortSignal) {
  return requestApiJson<OrgTreeNode[]>("/api/team/org", {
    method: "GET",
    signal,
  });
}

export interface TeamOrgGraphFlatNode {
  agent_id: string | null;
  department: string | null;
  display_name: string;
  display_title: string | null;
  group_ids: string[];
  icon: string | null;
  id: string;
  kind: "human" | "agent";
  location_term_id: string | null;
  location_term_label: string | null;
  location_term_slug: string | null;
  profile_id: string | null;
  profile_image_storage_key: string | null;
  reports_to_id: string | null;
  role_label: string | null;
  role_term_id: string | null;
  role_term_label: string | null;
  role_term_slug: string | null;
  status: string | null;
}

export async function getTeamOrgGraphData(signal?: AbortSignal) {
  return requestApiJson<TeamOrgGraphFlatNode[]>("/api/team/org/graph", {
    method: "GET",
    signal,
  });
}

export interface TeamOrgNodePatchInput {
  display_name?: string;
  display_title?: string | null;
  icon?: string | null;
  reports_to_id?: string | null;
  status?: string | null;
}

export async function patchTeamOrgNode(
  nodeId: string,
  body: TeamOrgNodePatchInput
) {
  return requestApiJson<{ id: string; reports_to_id: string | null }>(
    `/api/team/org/${nodeId}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    }
  );
}

export interface FilterOptionsGroup {
  taxonomy: TeamTaxonomy;
  terms: TeamTaxonomyTerm[];
}

export async function getTeamFilterOptions(signal?: AbortSignal) {
  return requestApiJson<FilterOptionsGroup[]>(
    "/api/team/taxonomies/filter-options",
    { method: "GET", signal }
  );
}

export interface TeamGroup {
  description: string | null;
  id: string;
  lead_org_node_id: string | null;
  name: string;
  type_term_id: string;
}

export async function getTeamGroups(signal?: AbortSignal) {
  return requestApiJson<TeamGroup[]>("/api/team/groups", {
    method: "GET",
    signal,
  });
}

export interface TeamMemberFieldDefinition {
  created_at: string;
  description: string;
  field_key: string;
  field_type:
    | "text_input"
    | "text_formatted"
    | "text_tiptap"
    | "number"
    | "date"
    | "date_range"
    | "url"
    | "image"
    | "file"
    | "select";
  id: string;
  label: string;
  multiple: boolean;
  options: string[];
  sort_order: number;
  tenant_id: string;
  updated_at: string;
  visibility: "shared" | "private" | "employment";
}

export type TeamMemberFieldDefinitionInput = Pick<
  TeamMemberFieldDefinition,
  | "description"
  | "field_key"
  | "field_type"
  | "id"
  | "label"
  | "multiple"
  | "options"
  | "sort_order"
  | "visibility"
>;

export async function getMemberFieldDefinitions(signal?: AbortSignal) {
  return requestApiJson<TeamMemberFieldDefinition[]>(
    "/api/team/member-field-definitions",
    {
      method: "GET",
      signal,
    }
  );
}

export async function putMemberFieldDefinitions(
  definitions: TeamMemberFieldDefinitionInput[]
) {
  return requestApiJson<TeamMemberFieldDefinition[]>(
    "/api/team/member-field-definitions",
    {
      method: "PUT",
      body: JSON.stringify({ definitions }),
    }
  );
}

export interface UserRecord {
  display_name: string | null;
  email: string;
  id: string;
  initials: string | null;
  phone: string | null;
  role: "admin" | "member";
}

export async function listUsers(signal?: AbortSignal): Promise<UserRecord[]> {
  return await request<UserRecord[]>("/api/users", { signal });
}
