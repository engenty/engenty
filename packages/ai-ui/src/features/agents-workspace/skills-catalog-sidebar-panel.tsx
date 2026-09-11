// Self-contained skills catalog sidebar used as the `sidebarOverride` on every
// `/admin/engenty/skills/*` route (list + detail). It owns its own search /
// group / filter / sort state so the same navigation chrome renders on the skill
// detail page without depending on the list page's table display state.

import { useTranslation } from "@engenty/i18n/ui";
import { useMemo, useState } from "react";
import type { AiSkillRecord } from "../../lib/admin/ai-runtime-api";
import { useAdminAgentsSidebarNavPersistence } from "./admin-agents-sidebar-nav-queries";
import {
  buildSkillCatalogSidebarLabels,
  SkillCatalogSidebar,
} from "./skills-catalog-sidebar";
import {
  filterAndSortSkills,
  getSkillCatalogModules,
  groupSkills,
  normalizeSkillRecord,
  type SkillCatalogGroupBy,
  type SkillCatalogOriginFilter,
  type SkillCatalogSortBy,
  type SkillCatalogTierFilter,
} from "./skills-catalog-state";

const ALL_VALUE = "all";

export function SkillCatalogSidebarPanel({
  loading,
  onSelectSkill,
  selectedSkillId,
  skills,
}: {
  loading: boolean;
  onSelectSkill: (skillName: string) => void;
  selectedSkillId: string;
  skills: AiSkillRecord[];
}) {
  const { t } = useTranslation("ai-ui");
  const [searchQuery, setSearchQuery] = useState("");
  // Group / filter / sort ride in the user's sidebar settings; the search box
  // stays local, so a reload never hides the catalog behind a stale query.
  const { catalogFilters, setCatalogFilters } =
    useAdminAgentsSidebarNavPersistence();
  const {
    groupBy,
    module: moduleFilter,
    origin: originFilter,
    sortBy,
    sortOrder,
    tier: tierFilter,
  } = catalogFilters.skills;
  const setGroupBy = (value: SkillCatalogGroupBy) =>
    setCatalogFilters("skills", { groupBy: value });
  const setOriginFilter = (value: SkillCatalogOriginFilter) =>
    setCatalogFilters("skills", { origin: value });
  const setTierFilter = (value: SkillCatalogTierFilter) =>
    setCatalogFilters("skills", { tier: value });
  const setModuleFilter = (value: string) =>
    setCatalogFilters("skills", { module: value });
  const setSortBy = (value: SkillCatalogSortBy) =>
    setCatalogFilters("skills", { sortBy: value });
  const setSortOrder = (value: "asc" | "desc") =>
    setCatalogFilters("skills", { sortOrder: value });

  const normalizedSkills = useMemo(
    () => skills.map(normalizeSkillRecord),
    [skills]
  );
  const moduleOptions = useMemo(
    () => [
      { label: t("skillsCatalog.filterAllModules"), value: ALL_VALUE },
      ...getSkillCatalogModules(normalizedSkills).map((moduleId) => ({
        label: moduleId,
        value: moduleId,
      })),
    ],
    [normalizedSkills, t]
  );
  const filteredSkills = useMemo(
    () =>
      filterAndSortSkills(normalizedSkills, {
        groupBy,
        moduleFilter,
        originFilter,
        searchQuery,
        sortBy,
        sortOrder,
        tierFilter,
      }),
    [
      groupBy,
      moduleFilter,
      normalizedSkills,
      originFilter,
      searchQuery,
      sortBy,
      sortOrder,
      tierFilter,
    ]
  );
  const groupedSkills = useMemo(
    () =>
      groupSkills(filteredSkills, groupBy, {
        core: t("skills.origin.core"),
        custom: t("skillsCatalog.tierCustom"),
        managed: t("skillsCatalog.tierManaged"),
        module: t("skills.origin.module"),
        tenant: t("skills.origin.tenant"),
        ungrouped: t("skillsCatalog.allSkills"),
      }),
    [filteredSkills, groupBy, t]
  );

  const emptyLabel = loading
    ? t("skillsCatalog.loading")
    : t("skillsCatalog.noResults");

  return (
    <SkillCatalogSidebar
      groupBy={groupBy}
      groups={groupedSkills}
      labels={buildSkillCatalogSidebarLabels(t, emptyLabel)}
      moduleFilter={moduleFilter}
      moduleOptions={moduleOptions}
      onGroupByChange={setGroupBy}
      onModuleFilterChange={setModuleFilter}
      onOriginFilterChange={setOriginFilter}
      onSearchChange={setSearchQuery}
      onSelectSkill={onSelectSkill}
      onSortByChange={setSortBy}
      onSortOrderChange={setSortOrder}
      onTierFilterChange={setTierFilter}
      originFilter={originFilter}
      searchQuery={searchQuery}
      selectedSkillId={selectedSkillId}
      sortBy={sortBy}
      sortOrder={sortOrder}
      tierFilter={tierFilter}
    />
  );
}
