import { useTranslation } from "@engenty/i18n/ui";
import { Button, Input } from "@engenty/ui-core";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { SpaceOptionalResourceRow } from "./SpaceOptionalResourceRow";
import { SpaceOptionalResourceSetupDialog } from "./SpaceOptionalResourceSetupDialog";
import { byCategory, type SpaceCatalogItem } from "./space-mount-catalog";
import {
  type SpaceSelection,
  skillPackFullySelected,
  toggleSelection,
  toggleSkillPack,
} from "./space-setup-selection";
import { useSpaceCatalogSearch } from "./use-space-catalog-search";

const NO_RECOMMENDATIONS = new Set<string>();

export function SpaceOptionalResourcePicker({
  commit,
  items,
  kind,
  recommendedIds = NO_RECOMMENDATIONS,
  selection,
}: {
  commit: (selection: SpaceSelection) => Promise<boolean>;
  items: SpaceCatalogItem[];
  kind: "skill";
  recommendedIds?: ReadonlySet<string>;
  selection: SpaceSelection;
}) {
  const { t } = useTranslation("common");
  const [query, setQuery] = useState("");
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const searching = query.trim().length > 0;
  const { items: resources, pending: searchPending } = useSpaceCatalogSearch(
    items,
    query
  );
  const libraryItems = useMemo(
    () =>
      kind === "skill" && !searching
        ? items.filter((item) => item.source === "library")
        : [],
    [items, kind, searching]
  );
  const selected = resources.filter(
    (item) =>
      selection.has(`${kind}:${item.id}`) &&
      !(kind === "skill" && item.source === "library" && !searching)
  );
  const available = resources.filter(
    (item) => !selection.has(`${kind}:${item.id}`)
  );
  const recommended = available.filter((item) => recommendedIds.has(item.id));
  const otherAvailable = available.filter(
    (item) =>
      !(
        recommendedIds.has(item.id) ||
        (kind === "skill" && item.source === "library" && !searching)
      )
  );
  const visibleOther = searching ? otherAvailable : [];
  const details = resources.find((item) => item.id === detailsId) ?? null;
  const detailsInSpace = details
    ? selection.has(`${kind}:${details.id}`)
    : false;

  const apply = async (next: SpaceSelection) => {
    setSaving(true);
    try {
      return await commit(next);
    } finally {
      setSaving(false);
    }
  };
  const renderRow = (item: SpaceCatalogItem) => (
    <SpaceOptionalResourceRow
      inSpace={selection.has(`${kind}:${item.id}`)}
      item={item}
      key={item.id}
      onOpen={() => setDetailsId(item.id)}
      saving={saving}
    />
  );

  return (
    <>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label={t(`spaces.setup.${kind}Search`)}
          className="pl-8"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t(`spaces.setup.${kind}Search`)}
          type="search"
          value={query}
        />
      </div>
      <div className="mt-3 min-h-64 divide-y divide-border">
        {selected.length > 0 ? (
          <div className="pb-2">
            <p className="px-2 pb-1 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
              {t("spaces.setup.resourceInSpaceSection")}
            </p>
            {selected.map(renderRow)}
          </div>
        ) : null}
        {recommended.length > 0 ? (
          <div className="pt-3">
            <p className="px-2 pb-1 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
              {t("spaces.setup.recommendedSection")}
            </p>
            {recommended.map(renderRow)}
          </div>
        ) : null}
        {kind === "skill" && !searching && libraryItems.length > 0
          ? byCategory(libraryItems).map(([category, group]) => {
              const packIds = group.map((item) => item.id);
              const packSelected = skillPackFullySelected(selection, packIds);
              return (
                <div className="pt-3" key={category}>
                  <div className="flex items-center justify-between gap-2 px-2 pb-1">
                    <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
                      {t(`spaces.categories.${category}`, {
                        defaultValue: category,
                      })}
                    </p>
                    <Button
                      className="h-auto px-1.5 py-0 text-[10px]"
                      disabled={saving}
                      onClick={() =>
                        apply(
                          toggleSkillPack(selection, packIds, !packSelected)
                        )
                      }
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      {packSelected
                        ? t("spaces.setup.removePackage")
                        : t("spaces.setup.addPackage")}
                    </Button>
                  </div>
                  {group.map(renderRow)}
                </div>
              );
            })
          : null}
        {visibleOther.length > 0 ? (
          <div className="pt-3">
            <p className="px-2 pb-1 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
              {t("spaces.setup.resourceAvailableSection")}
            </p>
            {byCategory(visibleOther).flatMap(([, group]) =>
              group.map(renderRow)
            )}
          </div>
        ) : null}
        {!(searching || recommended.length > 0 || selected.length > 0) &&
        otherAvailable.length > 0 ? (
          <p className="px-2 py-8 text-center text-muted-foreground text-sm">
            {t(`spaces.createWizard.${kind}SearchPrompt`)}
          </p>
        ) : null}
        {resources.length === 0 ? (
          <p className="px-2 py-6 text-center text-muted-foreground text-sm">
            {searchPending
              ? t("spaces.setup.catalogSearching")
              : t("spaces.setup.resourceNoMatches")}
          </p>
        ) : null}
      </div>
      <SpaceOptionalResourceSetupDialog
        inSpace={detailsInSpace}
        item={details}
        onAdd={() => {
          if (!details) {
            return Promise.resolve(false);
          }
          return apply(
            toggleSelection(
              selection,
              { resourceKey: details.id, resourceType: kind },
              true
            )
          );
        }}
        onOpenChange={(open) => {
          if (!open) {
            setDetailsId(null);
          }
        }}
        onRemove={
          details && detailsInSpace
            ? () =>
                apply(
                  toggleSelection(
                    selection,
                    { resourceKey: details.id, resourceType: kind },
                    false
                  )
                )
            : null
        }
        open={details !== null}
        saving={saving}
      />
    </>
  );
}
