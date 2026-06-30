import type { QueryClient } from "@engenty/query-client";
import type { TeamTaxonomyTerm } from "../api.js";
import {
  ROLE_ADD_NEW,
  ROLE_NONE,
} from "../components/team-member-role-field.js";
import { saveTaxonomyTerms, teamModuleKeys } from "../team-module-queries.js";
import {
  appendRoleTaxonomyTerm,
  DuplicateRoleTermSlugError,
} from "./append-role-taxonomy-term.js";
import { resolveTaxonomyTermSlug } from "./taxonomy-term-save.js";
import type { TeamMemberCreateFormValues } from "./team-member-create-form-schema.js";

export async function resolveCreateMemberRoleTerm(
  values: TeamMemberCreateFormValues,
  roleTerms: TeamTaxonomyTerm[],
  queryClient: QueryClient,
  t: (key: string) => string
): Promise<string | undefined> {
  if (values.role_selection === ROLE_NONE) {
    return;
  }
  if (values.role_selection !== ROLE_ADD_NEW) {
    return values.role_selection;
  }

  try {
    const mergedTerms = appendRoleTaxonomyTerm(roleTerms, {
      label: values.new_role_label,
      term_slug: values.new_role_slug,
    });
    const saved = await saveTaxonomyTerms("role", mergedTerms);
    await queryClient.invalidateQueries({ queryKey: teamModuleKeys.all });
    const slug = resolveTaxonomyTermSlug({
      label: values.new_role_label,
      term_slug: values.new_role_slug,
    });
    return saved.find((term) => term.term_slug === slug)?.id;
  } catch (err) {
    if (err instanceof DuplicateRoleTermSlugError) {
      throw new Error(t("duplicateRoleSlug"));
    }
    throw err;
  }
}
