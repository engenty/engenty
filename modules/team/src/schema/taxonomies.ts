export type TaxonomyBuiltin = "role" | "location" | "group-type";
export type TaxonomyTarget = "profile" | "group";
export type TaxonomyCardinality = "single" | "multiple";

export interface TeamTaxonomy {
  builtin: TaxonomyBuiltin | null;
  cardinality: TaxonomyCardinality;
  config: Record<string, unknown>;
  deletable: boolean;
  filterable: boolean;
  label: string;
  slug: string;
  sort_order: number;
  supports_hierarchy: boolean;
  supports_order: boolean;
  target: TaxonomyTarget;
  tenant_id: string;
}

export interface TeamTaxonomyTerm {
  id: string;
  label: string;
  metadata: Record<string, unknown>;
  parent_term_id: string | null;
  sort_order: number;
  taxonomy_slug: string;
  tenant_id: string;
  term_slug: string;
}

export interface TeamTaxonomyTermNode extends TeamTaxonomyTerm {
  children: TeamTaxonomyTermNode[];
}

export interface ProfileTaxonomyAssignment {
  profile_id: string;
  taxonomy_slug: string;
  tenant_id: string;
  term_id: string;
}

export type ProfileTaxonomiesResolved = Record<
  string,
  TeamTaxonomyTerm | TeamTaxonomyTerm[]
>;

export interface OrgNodeRow {
  agent_id: string | null;
  created_at: string;
  display_name: string;
  display_title: string | null;
  icon: string | null;
  id: string;
  node_kind: "human" | "agent";
  profile_id: string | null;
  reports_to_id: string | null;
  sort_order: number;
  status: string | null;
  tenant_id: string;
  updated_at: string;
}

export interface OrgNodeTreeNode {
  agent_id: string | null;
  display_name: string;
  display_title: string | null;
  icon: string | null;
  id: string;
  kind: "human" | "agent";
  profile_id: string | null;
  reports: OrgNodeTreeNode[];
  role_label: string | null;
  status: string | null;
}

/** Flat org node for graph editor and grouped layouts (GET /api/team/org/graph). */
export interface OrgGraphFlatNode {
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

export interface TeamGroupRow {
  created_at: string;
  description: string | null;
  id: string;
  lead_org_node_id: string | null;
  metadata: Record<string, unknown>;
  name: string;
  tenant_id: string;
  type_term_id: string;
  updated_at: string;
}

export interface TeamModuleSettings {
  agent_role_label_overrides: Record<string, string>;
}

export interface TeamRoleFilterOption {
  agent_definition_id?: string;
  label: string;
  member_kind: "human" | "agent";
  slug: string;
}

export const BUILTIN_TAXONOMY_SEEDS: Array<
  Omit<TeamTaxonomy, "tenant_id"> & { terms?: TeamTaxonomyTerm[] }
> = [
  {
    slug: "role",
    label: "Role",
    builtin: "role",
    target: "profile",
    supports_order: true,
    supports_hierarchy: false,
    cardinality: "single",
    filterable: true,
    sort_order: 0,
    config: {},
    deletable: false,
  },
  {
    slug: "location",
    label: "Location",
    builtin: "location",
    target: "profile",
    supports_order: true,
    supports_hierarchy: false,
    cardinality: "single",
    filterable: true,
    sort_order: 1,
    config: {},
    deletable: false,
  },
  {
    slug: "group-type",
    label: "Group type",
    builtin: "group-type",
    target: "group",
    supports_order: true,
    supports_hierarchy: false,
    cardinality: "single",
    filterable: true,
    sort_order: 2,
    config: { lead_label: "Lead" },
    deletable: false,
  },
];
