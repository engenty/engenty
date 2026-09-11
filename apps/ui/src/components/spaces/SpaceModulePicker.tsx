import { useTranslation } from "@engenty/i18n/ui";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
  Input,
} from "@engenty/ui-core";
import {
  type UiIconComponent,
  useUiContributions,
} from "@engenty/ui-plugin-sdk";
import { Boxes, ChevronDown, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { SpaceModuleRow } from "./SpaceModuleRow";
import { SpaceModuleSetupDialog } from "./SpaceModuleSetupDialog";
import { byCategory, type SpaceCatalogItem } from "./space-mount-catalog";
import {
  moduleRequiredBy,
  moduleRequiresFromItems,
  type SpaceAccessLevel,
  type SpaceSelection,
  setModuleAccess,
  toggleModuleSelection,
} from "./space-setup-selection";
import { useSpaceCatalogSearch } from "./use-space-catalog-search";

interface ModuleMeta {
  icon: UiIconComponent;
  item: SpaceCatalogItem;
}

const NO_RECOMMENDATIONS = new Set<string>();

export function SpaceModulePicker({
  commit,
  items,
  lockedKeys,
  recommendedKeys = NO_RECOMMENDATIONS,
  saving,
  selection,
}: {
  commit: (selection: SpaceSelection) => Promise<boolean>;
  items: SpaceCatalogItem[];
  lockedKeys: ReadonlySet<string>;
  recommendedKeys?: ReadonlySet<string>;
  saving: boolean;
  selection: SpaceSelection;
}) {
  const { t } = useTranslation("common");
  const { contributions } = useUiContributions();
  const [query, setQuery] = useState("");
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const metaById = useMemo(() => {
    const map = new Map<string, { icon?: UiIconComponent; label?: string }>();
    for (const entry of contributions.adminMenuItems) {
      // A module may register nested rows ("All", "Archived", …). The picker
      // names the module itself, so only its root contribution is canonical.
      if (entry.parentId) {
        continue;
      }
      const current = map.get(entry.pluginId) ?? {};
      map.set(entry.pluginId, {
        icon: current.icon ?? entry.icon,
        label:
          current.label ??
          (entry.labelKey
            ? t(entry.labelKey, { defaultValue: entry.label })
            : entry.label),
      });
    }
    for (const entry of contributions.copilotApps) {
      map.set(entry.pluginId, {
        icon: entry.icon ?? map.get(entry.pluginId)?.icon,
        label: entry.labelKey
          ? t(entry.labelKey, { defaultValue: entry.label })
          : entry.label,
      });
    }
    return map;
  }, [contributions.adminMenuItems, contributions.copilotApps, t]);

  // Mount dependencies: adding Projects
  // ticks Tasks along; Tasks cannot leave while Projects stays.
  const requires = useMemo(() => moduleRequiresFromItems(items), [items]);

  const labeled = useMemo<ModuleMeta[]>(
    () =>
      items.map((item) => {
        const meta = metaById.get(item.id);
        return {
          icon: meta?.icon ?? (Boxes as UiIconComponent),
          item: { ...item, name: meta?.label ?? item.name },
        };
      }),
    [items, metaById]
  );

  const unlocked = useMemo(
    () =>
      // Baseline / required mounts are added automatically — listing them
      // as locked "always in space" rows is noise, not a choice.
      labeled.filter(({ item }) => !lockedKeys.has(`module:${item.id}`)),
    [labeled, lockedKeys]
  );
  const searchable = useMemo(
    () => unlocked.map(({ item }) => item),
    [unlocked]
  );
  const { items: matchedItems, pending: searchPending } = useSpaceCatalogSearch(
    searchable,
    query
  );
  const modules = useMemo(() => {
    const rowById = new Map(unlocked.map((row) => [row.item.id, row]));
    return matchedItems.flatMap((item) => {
      const row = rowById.get(item.id);
      return row ? [row] : [];
    });
  }, [matchedItems, unlocked]);

  // Named with the rail's translated label, like the rows themselves.
  const nameOf = (moduleId: string) =>
    modules.find(({ item }) => item.id === moduleId)?.item.name ??
    items.find((item) => item.id === moduleId)?.name ??
    moduleId;
  const requiredByLabel = (moduleId: string): string | null => {
    const dependents = moduleRequiredBy(selection, moduleId, requires);
    return dependents.length > 0
      ? t("spaces.setup.moduleRequiredBy", {
          names: dependents.map(nameOf).join(", "),
        })
      : null;
  };

  const selected = modules.filter(({ item }) =>
    selection.has(`module:${item.id}`)
  );
  const available = modules.filter(
    ({ item }) => !selection.has(`module:${item.id}`)
  );
  const recommended = available.filter(({ item }) =>
    recommendedKeys.has(`module:${item.id}`)
  );
  const otherAvailable = available.filter(
    ({ item }) => !recommendedKeys.has(`module:${item.id}`)
  );
  const searching = query.trim().length > 0;
  const moreExpanded = searching || moreOpen;
  const details = modules.find(({ item }) => item.id === detailsId) ?? null;
  const detailsEntry = details
    ? selection.get(`module:${details.item.id}`)
    : undefined;
  const detailsLocked = details
    ? lockedKeys.has(`module:${details.item.id}`)
    : false;
  const detailsRequiredBy = details ? requiredByLabel(details.item.id) : null;

  const renderRow = (
    { icon: Icon, item }: ModuleMeta,
    isRecommended = false
  ) => {
    const key = `module:${item.id}`;
    const entry = selection.get(key);
    return (
      <SpaceModuleRow
        access={(entry?.agentAccess as SpaceAccessLevel | undefined) ?? null}
        Icon={Icon}
        inSpace={Boolean(entry)}
        item={item}
        key={item.id}
        locked={lockedKeys.has(key)}
        onAdd={() => {
          void commit(
            toggleModuleSelection(selection, item.id, true, requires)
          );
        }}
        onOpen={() => setDetailsId(item.id)}
        onRemove={
          entry && !(lockedKeys.has(key) || requiredByLabel(item.id))
            ? () => {
                void commit(
                  toggleModuleSelection(selection, item.id, false, requires)
                );
              }
            : undefined
        }
        recommended={isRecommended}
        requiredBy={entry ? requiredByLabel(item.id) : null}
        saving={saving}
      />
    );
  };

  return (
    <>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label={t("spaces.setup.moduleSearch")}
          className="pl-8"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("spaces.setup.moduleSearch")}
          type="search"
          value={query}
        />
      </div>

      <div className="mt-4 min-h-64 divide-y divide-border">
        {selected.length > 0 ? (
          <div className="pb-2">
            <p className="px-2 pb-1 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
              {t("spaces.setup.moduleInSpaceSection")}
            </p>
            {selected.map((entry) => renderRow(entry))}
          </div>
        ) : null}
        {recommended.length > 0 ? (
          <div className="pt-3">
            <p className="px-2 pb-1 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
              {t("spaces.setup.recommendedSection")}
            </p>
            {recommended.map((entry) => renderRow(entry, true))}
          </div>
        ) : null}
        {otherAvailable.length > 0 ? (
          <Collapsible
            className="pt-3"
            onOpenChange={setMoreOpen}
            open={moreExpanded}
          >
            <CollapsibleTrigger className="group flex w-full items-center gap-1 rounded-md px-2 py-1 text-left outline-none hover:bg-muted/40">
              <p className="min-w-0 flex-1 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
                {t("spaces.setup.moduleAvailableSection")}
                <span className="ml-1.5 font-normal tabular-nums">
                  {otherAvailable.length}
                </span>
              </p>
              <ChevronDown
                aria-hidden
                className={cn(
                  "size-3.5 shrink-0 text-muted-foreground/70 transition-transform",
                  moreExpanded && "rotate-180"
                )}
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              {byCategory(otherAvailable.map(({ item }) => item)).flatMap(
                ([, grouped]) =>
                  grouped.map((item) =>
                    renderRow(
                      otherAvailable.find((entry) => entry.item.id === item.id)!
                    )
                  )
              )}
            </CollapsibleContent>
          </Collapsible>
        ) : null}
        {modules.length === 0 ? (
          <p className="px-2 py-8 text-center text-muted-foreground text-sm">
            {searchPending
              ? t("spaces.setup.catalogSearching")
              : t("spaces.setup.moduleNoMatches")}
          </p>
        ) : null}
      </div>

      <SpaceModuleSetupDialog
        access={detailsEntry ? (detailsEntry.agentAccess ?? "none") : null}
        Icon={details?.icon ?? (Boxes as UiIconComponent)}
        item={details?.item ?? null}
        onApply={async (access: SpaceAccessLevel) => {
          if (!details) {
            return false;
          }
          let next = selection;
          if (!detailsEntry) {
            next = toggleModuleSelection(next, details.item.id, true, requires);
          }
          return commit(setModuleAccess(next, details.item.id, access));
        }}
        onOpenChange={(open) => {
          if (!open) {
            setDetailsId(null);
          }
        }}
        onRemove={
          details && detailsEntry && !(detailsLocked || detailsRequiredBy)
            ? () =>
                commit(
                  toggleModuleSelection(
                    selection,
                    details.item.id,
                    false,
                    requires
                  )
                )
            : null
        }
        open={details !== null}
        required={detailsLocked}
        requiredBy={detailsRequiredBy}
        saving={saving}
      />
    </>
  );
}
