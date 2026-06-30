import type { SupabaseClient } from "@supabase/supabase-js";
import { uuidv7 } from "uuidv7";
import type {
  TeamMemberFieldDefinition,
  TeamMemberFieldDefinitionInput,
} from "../schema/member-field-definitions.js";
import {
  BUILTIN_TAXONOMY_SEEDS,
  type OrgGraphFlatNode,
  type OrgNodeRow,
  type ProfileTaxonomyAssignment,
  type TeamGroupRow,
  type TeamModuleSettings,
  type TeamTaxonomy,
  type TeamTaxonomyTerm,
} from "../schema/taxonomies.js";
import {
  assertNoOrgCycle,
  buildOrgTree,
  resolveReportsToOrgNodeId,
} from "../services/org-tree.js";
import {
  assertNoTermCycle,
  buildTermTree,
  sortTerms,
  validateTermWrite,
} from "../services/taxonomy-resolver.js";

const SCHEMA = "module_team";

export class TaxonomyTermConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaxonomyTermConflictError";
  }
}

export function createTeamModuleDal(
  supabase: SupabaseClient,
  tenantId: string
) {
  const taxonomies = () => supabase.schema(SCHEMA).from("taxonomies");
  const terms = () => supabase.schema(SCHEMA).from("taxonomy_terms");
  const assignments = () =>
    supabase.schema(SCHEMA).from("profile_taxonomy_assignments");
  const orgNodes = () => supabase.schema(SCHEMA).from("org_nodes");
  const groups = () => supabase.schema(SCHEMA).from("groups");
  const groupMembers = () => supabase.schema(SCHEMA).from("group_members");
  const profiles = () => supabase.schema(SCHEMA).from("profiles");
  const memberFieldDefinitions = () =>
    supabase.schema(SCHEMA).from("member_field_definitions");

  async function ensureBuiltinTaxonomies(): Promise<void> {
    for (const seed of BUILTIN_TAXONOMY_SEEDS) {
      const { data: existing } = await taxonomies()
        .select("slug")
        .eq("tenant_id", tenantId)
        .eq("slug", seed.slug)
        .maybeSingle();
      if (existing) {
        continue;
      }
      const { error } = await taxonomies().insert({
        tenant_id: tenantId,
        slug: seed.slug,
        label: seed.label,
        builtin: seed.builtin,
        target: seed.target,
        supports_order: seed.supports_order,
        supports_hierarchy: seed.supports_hierarchy,
        cardinality: seed.cardinality,
        filterable: seed.filterable,
        sort_order: seed.sort_order,
        config: seed.config,
        deletable: seed.deletable,
      });
      if (error) {
        throw error;
      }
    }
  }

  return {
    ensureBuiltinTaxonomies,

    async listTaxonomies(): Promise<TeamTaxonomy[]> {
      await ensureBuiltinTaxonomies();
      const { data, error } = await taxonomies()
        .select("*")
        .eq("tenant_id", tenantId)
        .order("sort_order", { ascending: true });
      if (error) {
        throw error;
      }
      return (data ?? []) as TeamTaxonomy[];
    },

    async upsertTaxonomy(
      input: Omit<TeamTaxonomy, "tenant_id"> & { tenant_id?: string }
    ): Promise<TeamTaxonomy> {
      const row = { ...input, tenant_id: tenantId };
      const { data, error } = await taxonomies()
        .upsert(row, { onConflict: "tenant_id,slug" })
        .select("*")
        .single();
      if (error) {
        throw error;
      }
      return data as TeamTaxonomy;
    },

    async deleteTaxonomy(slug: string): Promise<void> {
      const { error } = await taxonomies()
        .delete()
        .eq("tenant_id", tenantId)
        .eq("slug", slug);
      if (error) {
        throw error;
      }
    },

    async listTerms(taxonomySlug: string): Promise<TeamTaxonomyTerm[]> {
      const { data, error } = await terms()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("taxonomy_slug", taxonomySlug);
      if (error) {
        throw error;
      }
      return (data ?? []) as TeamTaxonomyTerm[];
    },

    async upsertTerms(
      taxonomy: TeamTaxonomy,
      nextTerms: Array<{
        id?: string;
        term_slug: string;
        label: string;
        parent_term_id?: string | null;
        sort_order?: number;
        metadata?: Record<string, unknown>;
      }>
    ): Promise<TeamTaxonomyTerm[]> {
      const existing = await this.listTerms(taxonomy.slug);
      const existingById = new Map(existing.map((term) => [term.id, term]));
      const now = new Date().toISOString();

      const working: TeamTaxonomyTerm[] = [];
      const payloadIds = new Set<string>();

      for (const [index, input] of nextTerms.entries()) {
        const parentTermId = taxonomy.supports_hierarchy
          ? (input.parent_term_id ?? null)
          : null;
        validateTermWrite(taxonomy, parentTermId);

        const base = {
          tenant_id: tenantId,
          taxonomy_slug: taxonomy.slug,
          term_slug: input.term_slug,
          label: input.label,
          parent_term_id: parentTermId,
          sort_order: taxonomy.supports_order ? (input.sort_order ?? index) : 0,
          metadata: input.metadata ?? {},
          updated_at: now,
        };

        if (input.id) {
          const found = existingById.get(input.id);
          if (found) {
            // Known term — UPDATE it.
            if (found.taxonomy_slug !== taxonomy.slug) {
              throw new Error("Taxonomy term id not found for this taxonomy");
            }
            assertNoTermCycle(
              [
                ...existing.filter((term) => term.id !== input.id),
                { id: input.id, parent_term_id: parentTermId },
              ],
              input.id,
              parentTermId
            );
            const { error } = await terms()
              .update(base)
              .eq("tenant_id", tenantId)
              .eq("id", input.id);
            if (error) {
              throw error;
            }
            payloadIds.add(input.id);
            working.push({ ...found, ...base, id: input.id });
            continue;
          }

          // Unknown id — client-generated UUID for a new term. INSERT with it.
          assertNoTermCycle(
            [...working, { id: input.id, parent_term_id: parentTermId }],
            input.id,
            parentTermId
          );
          const row = { id: input.id, ...base, created_at: now };
          const { error } = await terms().insert(row);
          if (error) {
            throw error;
          }
          payloadIds.add(input.id);
          working.push(row as TeamTaxonomyTerm);
          continue;
        }

        // No id supplied — check if a term with this slug already exists.
        // This can happen on retry after a partial save: the first attempt
        // inserted the row but the response failed, so the UI re-submits
        // without an id. Reuse the existing UUID to avoid a unique constraint
        // violation on (tenant_id, taxonomy_slug, term_slug).
        const existingBySlug = existing.find(
          (t) => t.term_slug === input.term_slug
        );
        if (existingBySlug) {
          assertNoTermCycle(
            [
              ...existing.filter((t) => t.id !== existingBySlug.id),
              { id: existingBySlug.id, parent_term_id: parentTermId },
            ],
            existingBySlug.id,
            parentTermId
          );
          const { error } = await terms()
            .update(base)
            .eq("tenant_id", tenantId)
            .eq("id", existingBySlug.id);
          if (error) {
            throw error;
          }
          payloadIds.add(existingBySlug.id);
          working.push({ ...existingBySlug, ...base });
          continue;
        }

        const id = uuidv7();
        assertNoTermCycle(
          [...working, { id, parent_term_id: parentTermId }],
          id,
          parentTermId
        );
        const row = {
          id,
          ...base,
          created_at: now,
        };
        const { error } = await terms().insert(row);
        if (error) {
          throw error;
        }
        payloadIds.add(id);
        working.push(row as TeamTaxonomyTerm);
      }

      const toDelete = existing
        .filter((term) => !payloadIds.has(term.id))
        .map((term) => term.id);

      for (const termId of toDelete) {
        const { count: assignmentCount, error: assignmentError } =
          await assignments()
            .select("*", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .eq("term_id", termId);
        if (assignmentError) {
          throw assignmentError;
        }
        const { count: groupCount, error: groupError } = await groups()
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("type_term_id", termId);
        if (groupError) {
          throw groupError;
        }
        if ((assignmentCount ?? 0) > 0 || (groupCount ?? 0) > 0) {
          const term = existingById.get(termId);
          throw new TaxonomyTermConflictError(
            `Taxonomy term "${term?.label ?? termId}" is in use and cannot be deleted`
          );
        }
      }

      if (toDelete.length > 0) {
        const { error } = await terms()
          .delete()
          .eq("tenant_id", tenantId)
          .eq("taxonomy_slug", taxonomy.slug)
          .in("id", toDelete);
        if (error) {
          throw error;
        }
      }

      return this.listTerms(taxonomy.slug);
    },

    async getTermsTree(taxonomySlug: string) {
      const taxList = await this.listTaxonomies();
      const taxonomy = taxList.find((t) => t.slug === taxonomySlug);
      if (!taxonomy) {
        throw new Error("Taxonomy not found");
      }
      const flat = await this.listTerms(taxonomySlug);
      return buildTermTree(flat, taxonomy);
    },

    async setProfileTaxonomies(
      profileId: string,
      values: Record<string, string | string[]>
    ): Promise<void> {
      await assignments().delete().eq("profile_id", profileId);

      const rows: ProfileTaxonomyAssignment[] = [];
      for (const [taxonomySlug, raw] of Object.entries(values)) {
        const termIds = Array.isArray(raw) ? raw : [raw];
        for (const termId of termIds) {
          if (!termId) {
            continue;
          }
          rows.push({
            tenant_id: tenantId,
            profile_id: profileId,
            taxonomy_slug: taxonomySlug,
            term_id: termId,
          });
        }
      }
      if (rows.length > 0) {
        const { error } = await assignments().insert(rows);
        if (error) {
          throw error;
        }
      }
    },

    async getProfileTaxonomies(
      profileId: string
    ): Promise<Record<string, TeamTaxonomyTerm>> {
      const { data, error } = await assignments()
        .select("taxonomy_slug, term_id")
        .eq("profile_id", profileId);
      if (error) {
        throw error;
      }
      const result: Record<string, TeamTaxonomyTerm> = {};
      for (const row of data ?? []) {
        const { data: term } = await terms()
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("id", row.term_id)
          .maybeSingle();
        if (term) {
          result[row.taxonomy_slug] = term as TeamTaxonomyTerm;
        }
      }
      return result;
    },

    async getHumanOrgNodeByProfileId(profileId: string): Promise<{
      org_node_id: string;
      reports_to_display_name: string | null;
      reports_to_id: string | null;
    } | null> {
      const { data: node, error } = await orgNodes()
        .select("id, reports_to_id")
        .eq("tenant_id", tenantId)
        .eq("profile_id", profileId)
        .eq("node_kind", "human")
        .maybeSingle();
      if (error) {
        throw error;
      }
      if (!node) {
        return null;
      }
      let reports_to_display_name: string | null = null;
      const reportsToId = (node as { reports_to_id: string | null })
        .reports_to_id;
      if (reportsToId) {
        const { data: manager } = await orgNodes()
          .select("display_name")
          .eq("tenant_id", tenantId)
          .eq("id", reportsToId)
          .maybeSingle();
        reports_to_display_name =
          (manager as { display_name: string } | null)?.display_name ?? null;
      }
      return {
        org_node_id: (node as { id: string }).id,
        reports_to_id: reportsToId,
        reports_to_display_name,
      };
    },

    async getHumanOrgReportsByProfileIds(profileIds: string[]): Promise<
      Map<
        string,
        {
          org_node_id: string;
          reports_to_display_name: string | null;
          reports_to_id: string | null;
        }
      >
    > {
      const unique = [...new Set(profileIds.filter(Boolean))];
      if (unique.length === 0) {
        return new Map();
      }

      const { data: nodes, error } = await orgNodes()
        .select("id, profile_id, reports_to_id")
        .eq("tenant_id", tenantId)
        .eq("node_kind", "human")
        .in("profile_id", unique);
      if (error) {
        throw error;
      }

      const reportsToIds = new Set<string>();
      for (const node of nodes ?? []) {
        const reportsToId = (node as { reports_to_id: string | null })
          .reports_to_id;
        if (reportsToId) {
          reportsToIds.add(reportsToId);
        }
      }

      const displayNameByNodeId = new Map<string, string>();
      if (reportsToIds.size > 0) {
        const { data: managers, error: mgrErr } = await orgNodes()
          .select("id, display_name")
          .eq("tenant_id", tenantId)
          .in("id", [...reportsToIds]);
        if (mgrErr) {
          throw mgrErr;
        }
        for (const mgr of managers ?? []) {
          displayNameByNodeId.set(
            String((mgr as { id: string }).id),
            String((mgr as { display_name: string }).display_name)
          );
        }
      }

      const result = new Map<
        string,
        {
          org_node_id: string;
          reports_to_display_name: string | null;
          reports_to_id: string | null;
        }
      >();
      for (const node of nodes ?? []) {
        const profileId = (node as { profile_id: string | null }).profile_id;
        if (!profileId) {
          continue;
        }
        const reportsToId = (node as { reports_to_id: string | null })
          .reports_to_id;
        result.set(profileId, {
          org_node_id: String((node as { id: string }).id),
          reports_to_id: reportsToId,
          reports_to_display_name: reportsToId
            ? (displayNameByNodeId.get(reportsToId) ?? null)
            : null,
        });
      }
      return result;
    },

    async ensureHumanOrgNode(
      profileId: string,
      displayName: string
    ): Promise<OrgNodeRow> {
      const { data: existing } = await orgNodes()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("profile_id", profileId)
        .maybeSingle();
      if (existing) {
        return existing as OrgNodeRow;
      }
      const id = uuidv7();
      const now = new Date().toISOString();
      const row = {
        id,
        tenant_id: tenantId,
        node_kind: "human",
        profile_id: profileId,
        agent_id: null,
        display_name: displayName,
        display_title: null,
        icon: null,
        status: "active",
        reports_to_id: null,
        sort_order: 0,
        created_at: now,
        updated_at: now,
      };
      const { data, error } = await orgNodes().insert(row).select("*").single();
      if (error) {
        throw error;
      }
      return data as OrgNodeRow;
    },

    async listOrgNodes(): Promise<OrgNodeRow[]> {
      const { data, error } = await orgNodes()
        .select("*")
        .eq("tenant_id", tenantId);
      if (error) {
        throw error;
      }
      return (data ?? []) as OrgNodeRow[];
    },

    async getOrgTree() {
      const nodes = await this.listOrgNodes();
      const roleLabels = new Map<string, string | null>();
      for (const node of nodes) {
        if (node.node_kind === "human" && node.profile_id) {
          const assigned = await this.getProfileTaxonomies(node.profile_id);
          roleLabels.set(node.profile_id, assigned.role?.label ?? null);
        }
      }
      return buildOrgTree(nodes, roleLabels);
    },

    async getOrgGraphData(): Promise<OrgGraphFlatNode[]> {
      const nodes = await this.listOrgNodes();
      const profileIds = nodes
        .map((node) => node.profile_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0);

      const departmentByProfile = new Map<string, string | null>();
      const profileImageByProfile = new Map<string, string | null>();
      if (profileIds.length > 0) {
        const { data: profileRows, error: profileError } = await profiles()
          .select("id, department, profile_image_storage_key")
          .eq("tenant_id", tenantId)
          .in("id", profileIds);
        if (profileError) {
          throw profileError;
        }
        for (const row of profileRows ?? []) {
          const profileId = String(row.id);
          departmentByProfile.set(
            profileId,
            (row.department as string | null) ?? null
          );
          profileImageByProfile.set(
            profileId,
            (row.profile_image_storage_key as string | null) ?? null
          );
        }
      }

      const taxonomiesByProfile = new Map<
        string,
        Record<string, TeamTaxonomyTerm>
      >();
      if (profileIds.length > 0) {
        const { data: assignmentRows, error: assignmentError } =
          await assignments()
            .select("profile_id, taxonomy_slug, term_id")
            .eq("tenant_id", tenantId)
            .in("profile_id", profileIds)
            .in("taxonomy_slug", ["role", "location"]);
        if (assignmentError) {
          throw assignmentError;
        }
        const roleTerms = await this.listTerms("role");
        const locationTerms = await this.listTerms("location");
        const termById = (taxonomySlug: string, termId: string) => {
          const list = taxonomySlug === "role" ? roleTerms : locationTerms;
          return list.find((term) => term.id === termId) ?? null;
        };
        for (const row of assignmentRows ?? []) {
          const profileId = String(row.profile_id);
          const taxonomySlug = String(row.taxonomy_slug);
          const term = termById(taxonomySlug, String(row.term_id));
          if (!term) {
            continue;
          }
          const existing = taxonomiesByProfile.get(profileId) ?? {};
          existing[taxonomySlug] = term;
          taxonomiesByProfile.set(profileId, existing);
        }
      }

      const groupIdsByNode = new Map<string, string[]>();
      const nodeIds = nodes.map((node) => node.id);
      if (nodeIds.length > 0) {
        const { data: memberRows, error: memberError } = await groupMembers()
          .select("org_node_id, group_id")
          .eq("tenant_id", tenantId)
          .in("org_node_id", nodeIds);
        if (memberError) {
          throw memberError;
        }
        for (const row of memberRows ?? []) {
          const orgNodeId = String(row.org_node_id);
          const groupId = String(row.group_id);
          const list = groupIdsByNode.get(orgNodeId) ?? [];
          list.push(groupId);
          groupIdsByNode.set(orgNodeId, list);
        }
      }

      return nodes.map((node) => {
        const profileId = node.profile_id;
        const assigned =
          profileId == null ? {} : (taxonomiesByProfile.get(profileId) ?? {});
        const roleTerm = assigned.role ?? null;
        const locationTerm = assigned.location ?? null;
        return {
          id: node.id,
          kind: node.node_kind,
          profile_id: node.profile_id,
          agent_id: node.agent_id,
          display_name: node.display_name,
          display_title: node.display_title,
          icon: node.icon,
          status: node.status,
          reports_to_id: node.reports_to_id,
          role_label:
            node.node_kind === "human" && profileId
              ? (roleTerm?.label ?? null)
              : null,
          department:
            profileId == null
              ? null
              : (departmentByProfile.get(profileId) ?? null),
          role_term_id: roleTerm?.id ?? null,
          role_term_slug: roleTerm?.term_slug ?? null,
          role_term_label: roleTerm?.label ?? null,
          location_term_id: locationTerm?.id ?? null,
          location_term_slug: locationTerm?.term_slug ?? null,
          location_term_label: locationTerm?.label ?? null,
          group_ids: groupIdsByNode.get(node.id) ?? [],
          profile_image_storage_key:
            profileId == null
              ? null
              : (profileImageByProfile.get(profileId) ?? null),
        } satisfies OrgGraphFlatNode;
      });
    },

    async updateOrgNode(
      nodeId: string,
      patch: Partial<
        Pick<
          OrgNodeRow,
          | "reports_to_id"
          | "display_name"
          | "display_title"
          | "icon"
          | "status"
          | "sort_order"
        >
      >
    ): Promise<OrgNodeRow> {
      const nodes = await this.listOrgNodes();
      if ("reports_to_id" in patch) {
        assertNoOrgCycle(nodes, nodeId, patch.reports_to_id ?? null);
      }
      const { data, error } = await orgNodes()
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("tenant_id", tenantId)
        .eq("id", nodeId)
        .select("*")
        .single();
      if (error) {
        throw error;
      }
      return data as OrgNodeRow;
    },

    async resolveReportsToOrgNodeId(
      reference: string | null
    ): Promise<string | null> {
      const nodes = await this.listOrgNodes();
      return resolveReportsToOrgNodeId(nodes, reference);
    },

    async listGroups(): Promise<TeamGroupRow[]> {
      const { data, error } = await groups()
        .select("*")
        .eq("tenant_id", tenantId)
        .order("name", { ascending: true });
      if (error) {
        throw error;
      }
      return (data ?? []) as TeamGroupRow[];
    },

    async createGroup(input: {
      name: string;
      description?: string | null;
      type_term_id: string;
      lead_org_node_id?: string | null;
    }): Promise<TeamGroupRow> {
      const groupTypeTerms = await this.listTerms("group-type");
      const typeTerm = groupTypeTerms.find(
        (term) => term.id === input.type_term_id
      );
      if (!typeTerm) {
        throw new Error("Group type term not found");
      }

      const id = uuidv7();
      const now = new Date().toISOString();
      const { data, error } = await groups()
        .insert({
          id,
          tenant_id: tenantId,
          name: input.name,
          description: input.description ?? null,
          type_term_id: input.type_term_id,
          lead_org_node_id: input.lead_org_node_id ?? null,
          metadata: {},
          created_at: now,
          updated_at: now,
        })
        .select("*")
        .single();
      if (error) {
        throw error;
      }
      return data as TeamGroupRow;
    },

    async listFilterOptions() {
      await ensureBuiltinTaxonomies();
      const taxonomiesList = (await this.listTaxonomies()).filter(
        (t) => t.filterable
      );
      const result: Array<{
        taxonomy: TeamTaxonomy;
        terms: TeamTaxonomyTerm[];
      }> = [];
      for (const taxonomy of taxonomiesList) {
        const flat = await this.listTerms(taxonomy.slug);
        result.push({
          taxonomy,
          terms: sortTerms(flat, taxonomy),
        });
      }
      return result;
    },

    async getModuleSettings(): Promise<TeamModuleSettings> {
      return { agent_role_label_overrides: {} };
    },

    async listMemberFieldDefinitions(): Promise<TeamMemberFieldDefinition[]> {
      const { data, error } = await memberFieldDefinitions()
        .select("*")
        .eq("tenant_id", tenantId)
        .order("visibility", { ascending: true })
        .order("sort_order", { ascending: true });
      if (error) {
        throw error;
      }
      return (data ?? []).map((row) => ({
        ...(row as TeamMemberFieldDefinition),
        options: Array.isArray(row.options) ? (row.options as string[]) : [],
      }));
    },

    async replaceMemberFieldDefinitions(
      definitions: TeamMemberFieldDefinitionInput[]
    ): Promise<TeamMemberFieldDefinition[]> {
      const now = new Date().toISOString();
      const rows = definitions.map((definition) => ({
        id: definition.id || uuidv7(),
        tenant_id: tenantId,
        visibility: definition.visibility,
        field_type: definition.field_type,
        label: definition.label,
        description: definition.description,
        field_key: definition.field_key,
        options: definition.options,
        sort_order: definition.sort_order,
        multiple: definition.multiple,
        created_at: now,
        updated_at: now,
      }));

      const { error: deleteError } = await memberFieldDefinitions()
        .delete()
        .eq("tenant_id", tenantId);
      if (deleteError) {
        throw deleteError;
      }

      if (rows.length === 0) {
        return [];
      }

      const { data, error } = await memberFieldDefinitions()
        .insert(rows)
        .select("*")
        .order("visibility", { ascending: true })
        .order("sort_order", { ascending: true });
      if (error) {
        throw error;
      }
      return (data ?? []).map((row) => ({
        ...(row as TeamMemberFieldDefinition),
        options: Array.isArray(row.options) ? (row.options as string[]) : [],
      }));
    },
  };
}

export type TeamModuleDal = ReturnType<typeof createTeamModuleDal>;
