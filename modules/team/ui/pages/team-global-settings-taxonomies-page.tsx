/**
 * TeamGlobalSettingsTaxonomiesPage — dynamically-driven taxonomy manager.
 *
 * Shows all taxonomies (built-ins first, then custom) from the API.
 * Each taxonomy gets a TeamTaxonomyManagerSection card with:
 *   - Built-ins: only term editing (no rename / delete of the taxonomy itself)
 *   - Custom: inline label + plural + hierarchy toggle + delete button
 *
 * "Add taxonomy" button at the bottom opens TeamAddTaxonomyDialog.
 *
 * Save flow:
 *   1. For every modified taxonomy's terms → PUT /api/team/taxonomies/:slug/terms
 *   2. For custom taxonomies with changed label/plural/hierarchy → PATCH /api/team/taxonomies/:slug
 */
import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  Button,
  Skeleton,
  TopbarActionLabel,
  topbarIconButtonClassName,
} from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { Plus, Save } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  deleteTaxonomy,
  patchTaxonomy,
  type TeamTaxonomy,
  type TeamTaxonomyTerm,
} from "../api.js";
import { TeamAddTaxonomyDialog } from "../components/team-add-taxonomy-dialog.js";
import { TeamGlobalSettingsLayout } from "../components/team-global-settings-layout.js";
import {
  type TaxonomyTermDraftFlat,
  TeamTaxonomyManagerSection,
} from "../components/team-taxonomy-manager-section.js";
import { draftsToTaxonomyTermsForSave } from "../lib/taxonomy-term-save.js";
import {
  saveTaxonomyTerms,
  teamModuleKeys,
  teamSettingsQueryOptions,
} from "../team-module-queries.js";

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

interface TaxonomyState {
  taxonomy: TeamTaxonomy;
  terms: TaxonomyTermDraftFlat[];
}

function termsToDrafts(
  terms: Array<
    | TeamTaxonomyTerm
    | {
        id: string;
        label: string;
        sort_order?: number;
        parent_term_id?: string | null;
      }
  >
): TaxonomyTermDraftFlat[] {
  return [...terms]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((term, index) => ({
      id: term.id,
      label: term.label,
      sort_order: term.sort_order ?? index,
      parent_term_id: (term as TeamTaxonomyTerm).parent_term_id ?? null,
      // _key = real UUID for persisted terms so children's parent_term_id matches
      _key: term.id,
    }));
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function TeamGlobalSettingsTaxonomiesPage() {
  const { t } = useTranslation("team");
  const queryClient = useQueryClient();
  const settingsQuery = useQuery(teamSettingsQueryOptions());
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // Ordered list of (taxonomy, draft terms) — synced once from API, then local
  const [taxonomyStates, setTaxonomyStates] = useState<TaxonomyState[]>([]);
  const syncedRef = useRef(false);

  useEffect(() => {
    if (!settingsQuery.data || syncedRef.current) {
      return;
    }
    syncedRef.current = true;
    const { taxonomies, termsByTaxonomy } = settingsQuery.data;
    setTaxonomyStates(
      taxonomies.map((taxonomy) => ({
        taxonomy,
        terms: termsToDrafts(
          (termsByTaxonomy[taxonomy.slug] as TeamTaxonomyTerm[] | undefined) ??
            []
        ),
      }))
    );
  }, [settingsQuery.data]);

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Patch taxonomy metadata (label, plural, hierarchy) for custom taxonomies
      for (const state of taxonomyStates) {
        if (!state.taxonomy.builtin) {
          await patchTaxonomy(state.taxonomy.slug, {
            label: state.taxonomy.label,
            supports_hierarchy: state.taxonomy.supports_hierarchy,
            config: state.taxonomy.config,
          });
        }
      }
      // Save all terms
      for (const state of taxonomyStates) {
        await saveTaxonomyTerms(
          state.taxonomy.slug,
          draftsToTaxonomyTermsForSave(state.terms)
        );
      }
    },
    onSuccess: async () => {
      syncedRef.current = false; // allow re-sync on next data load
      await queryClient.invalidateQueries({ queryKey: teamModuleKeys.all });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (slug: string) => {
      await deleteTaxonomy(slug);
    },
    onSuccess: async (_, slug) => {
      setTaxonomyStates((prev) => prev.filter((s) => s.taxonomy.slug !== slug));
      await queryClient.invalidateQueries({ queryKey: teamModuleKeys.all });
    },
  });

  // ---------------------------------------------------------------------------
  // Per-taxonomy update helpers
  // ---------------------------------------------------------------------------

  const updateTaxonomyTerms = (
    slug: string,
    terms: TaxonomyTermDraftFlat[]
  ) => {
    setTaxonomyStates((prev) =>
      prev.map((s) => (s.taxonomy.slug === slug ? { ...s, terms } : s))
    );
  };

  const updateTaxonomyLabel = (slug: string, label: string) => {
    setTaxonomyStates((prev) =>
      prev.map((s) =>
        s.taxonomy.slug === slug
          ? { ...s, taxonomy: { ...s.taxonomy, label } }
          : s
      )
    );
  };

  const updateTaxonomyPluralLabel = (slug: string, plural: string) => {
    setTaxonomyStates((prev) =>
      prev.map((s) =>
        s.taxonomy.slug === slug
          ? {
              ...s,
              taxonomy: {
                ...s.taxonomy,
                config: { ...s.taxonomy.config, plural_label: plural },
              },
            }
          : s
      )
    );
  };

  const updateTaxonomyHierarchy = (slug: string, val: boolean) => {
    setTaxonomyStates((prev) =>
      prev.map((s) =>
        s.taxonomy.slug === slug
          ? { ...s, taxonomy: { ...s.taxonomy, supports_hierarchy: val } }
          : s
      )
    );
  };

  // ---------------------------------------------------------------------------
  // Topbar actions
  // ---------------------------------------------------------------------------

  const pageActions = useMemo(
    () => (
      <Button
        className={topbarIconButtonClassName}
        disabled={saveMutation.isPending || settingsQuery.isLoading}
        onClick={() => saveMutation.mutate()}
        size="sm"
        type="button"
      >
        {saveMutation.isPending ? (
          <AnimatedLoaderIcon
            aria-hidden
            className="md:mr-1.5"
            play="always"
            size="sm"
          />
        ) : (
          <Save aria-hidden className="h-4 w-4 md:mr-1.5" />
        )}
        <TopbarActionLabel>
          {saveMutation.isPending ? t("loading") : t("save")}
        </TopbarActionLabel>
      </Button>
    ),
    [saveMutation, settingsQuery.isLoading, t]
  );

  usePageConfig({
    actions: settingsQuery.isLoading ? null : pageActions,
  });

  // ---------------------------------------------------------------------------
  // Loading / error states
  // ---------------------------------------------------------------------------

  if (settingsQuery.isLoading) {
    return (
      <TeamGlobalSettingsLayout>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </TeamGlobalSettingsLayout>
    );
  }

  if (settingsQuery.isError) {
    return (
      <TeamGlobalSettingsLayout>
        <p className="text-destructive text-sm">{t("settings.loadFailed")}</p>
      </TeamGlobalSettingsLayout>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <TeamGlobalSettingsLayout>
      <header className="space-y-1">
        <p className="text-muted-foreground text-sm">
          {t("globalSettings.taxonomies_description")}
        </p>
      </header>

      {saveMutation.isError && (
        <p className="text-destructive text-sm">
          {saveMutation.error instanceof Error
            ? saveMutation.error.message
            : t("saveFailed")}
        </p>
      )}

      {/* Built-in taxonomies (role, location, group-type) */}
      {taxonomyStates
        .filter((s) => s.taxonomy.builtin)
        .map((state) => (
          <TeamTaxonomyManagerSection
            key={state.taxonomy.slug}
            onTermsChange={(terms) =>
              updateTaxonomyTerms(state.taxonomy.slug, terms)
            }
            taxonomy={state.taxonomy}
            terms={state.terms}
          />
        ))}

      {/* Custom taxonomies */}
      {taxonomyStates.filter((s) => !s.taxonomy.builtin).length > 0 && (
        <div className="space-y-3">
          <h3 className="font-medium text-muted-foreground text-sm uppercase tracking-wide">
            {t("settings.customTaxonomies")}
          </h3>
          {taxonomyStates
            .filter((s) => !s.taxonomy.builtin)
            .map((state) => (
              <TeamTaxonomyManagerSection
                key={state.taxonomy.slug}
                onDelete={() => deleteMutation.mutate(state.taxonomy.slug)}
                onLabelChange={(label) =>
                  updateTaxonomyLabel(state.taxonomy.slug, label)
                }
                onPluralLabelChange={(plural) =>
                  updateTaxonomyPluralLabel(state.taxonomy.slug, plural)
                }
                onSupportsHierarchyChange={(val) =>
                  updateTaxonomyHierarchy(state.taxonomy.slug, val)
                }
                onTermsChange={(terms) =>
                  updateTaxonomyTerms(state.taxonomy.slug, terms)
                }
                taxonomy={state.taxonomy}
                terms={state.terms}
              />
            ))}
        </div>
      )}

      {/* Add taxonomy */}
      <Button
        className="w-fit"
        onClick={() => setAddDialogOpen(true)}
        size="sm"
        type="button"
        variant="outline"
      >
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        {t("settings.addTaxonomy")}
      </Button>

      <TeamAddTaxonomyDialog
        onOpenChange={setAddDialogOpen}
        onSuccess={(taxonomy) => {
          setTaxonomyStates((prev) => [...prev, { taxonomy, terms: [] }]);
        }}
        open={addDialogOpen}
      />
    </TeamGlobalSettingsLayout>
  );
}

/** @deprecated Use {@link TeamGlobalSettingsTaxonomiesPage} */
export const TeamSettingsPage = TeamGlobalSettingsTaxonomiesPage;
