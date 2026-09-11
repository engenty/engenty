import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import { Button, Skeleton } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { Save } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { TeamModulePageScroll } from "../components/team-module-page-scroll.js";
import {
  type TaxonomyTermDraft,
  TeamTaxonomyTermsSection,
} from "../components/team-taxonomy-terms-section.js";
import { useTeamModuleSecondaryShellNav } from "../hooks/use-team-module-secondary-shell-nav.js";
import { draftsToTaxonomyTermsForSave } from "../lib/taxonomy-term-save.js";
import {
  saveTaxonomyTerms,
  teamModuleKeys,
  teamSettingsQueryOptions,
} from "../team-module-queries.js";

function termsToDrafts(
  terms: Array<{
    id: string;
    label: string;
    sort_order?: number;
  }>
): TaxonomyTermDraft[] {
  return [...terms]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((term, index) => ({
      id: term.id,
      label: term.label,
      sort_order: term.sort_order ?? index,
    }));
}

export function TeamSettingsPage() {
  const { t } = useTranslation("team");
  const shellNav = useTeamModuleSecondaryShellNav();
  const queryClient = useQueryClient();
  const settingsQuery = useQuery(teamSettingsQueryOptions());
  const [roleTerms, setRoleTerms] = useState<TaxonomyTermDraft[]>([]);
  const [locationTerms, setLocationTerms] = useState<TaxonomyTermDraft[]>([]);
  const [groupTypeTerms, setGroupTypeTerms] = useState<TaxonomyTermDraft[]>([]);
  const syncedRef = useRef(false);

  useEffect(() => {
    if (!settingsQuery.data || syncedRef.current) {
      return;
    }
    syncedRef.current = true;
    const { termsByTaxonomy } = settingsQuery.data;
    setRoleTerms(
      termsToDrafts(
        (termsByTaxonomy.role as Array<{ id: string; label: string }>) ?? []
      )
    );
    setLocationTerms(
      termsToDrafts(
        (termsByTaxonomy.location as Array<{ id: string; label: string }>) ?? []
      )
    );
    setGroupTypeTerms(
      termsToDrafts(
        (termsByTaxonomy["group-type"] as Array<{
          id: string;
          label: string;
        }>) ?? []
      )
    );
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await saveTaxonomyTerms("role", draftsToTaxonomyTermsForSave(roleTerms));
      await saveTaxonomyTerms(
        "location",
        draftsToTaxonomyTermsForSave(locationTerms)
      );
      await saveTaxonomyTerms(
        "group-type",
        draftsToTaxonomyTermsForSave(groupTypeTerms)
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: teamModuleKeys.all });
    },
  });

  const pageActions = useMemo(
    () => (
      <Button
        disabled={saveMutation.isPending || settingsQuery.isLoading}
        onClick={() => saveMutation.mutate()}
        size="sm"
      >
        <Save className="mr-1.5 h-3.5 w-3.5" />
        {t("save")}
      </Button>
    ),
    [saveMutation, settingsQuery.isLoading, t]
  );

  usePageConfig({
    actions: pageActions,
    breadcrumbs: [
      ...(shellNav.moduleRootCrumb ? [shellNav.moduleRootCrumb] : []),
      { label: t("sidebar.module_settings") },
    ],
    secondaryNavAfterItems: shellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: shellNav.secondaryNavHeaderSlot,
  });

  if (settingsQuery.isLoading) {
    return (
      <TeamModulePageScroll variant="narrow">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </TeamModulePageScroll>
    );
  }

  if (settingsQuery.isError) {
    return (
      <TeamModulePageScroll variant="narrow">
        <p className="text-destructive text-sm">{t("settings.loadFailed")}</p>
      </TeamModulePageScroll>
    );
  }

  return (
    <TeamModulePageScroll variant="narrow">
      <TeamTaxonomyTermsSection
        description={t("settings.rolesDesc")}
        onChange={setRoleTerms}
        terms={roleTerms}
        title={t("settings.rolesTitle")}
      />
      <TeamTaxonomyTermsSection
        description={t("settings.locationsDesc")}
        onChange={setLocationTerms}
        terms={locationTerms}
        title={t("settings.locationsTitle")}
      />
      <TeamTaxonomyTermsSection
        description={t("settings.groupTypesDesc")}
        onChange={setGroupTypeTerms}
        terms={groupTypeTerms}
        title={t("settings.groupTypesTitle")}
      />
    </TeamModulePageScroll>
  );
}
