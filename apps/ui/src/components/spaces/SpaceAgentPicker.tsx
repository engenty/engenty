import { useTranslation } from "@engenty/i18n/ui";
import { Input } from "@engenty/ui-core";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SpaceAgentRow } from "./SpaceAgentRow";
import { SpaceAgentSetupDialog } from "./SpaceAgentSetupDialog";
import { byCategory, type SpaceCatalogItem } from "./space-mount-catalog";
import { type SpaceSelection, toggleSelection } from "./space-setup-selection";
import { useSpaceCatalogSearch } from "./use-space-catalog-search";

const NO_RECOMMENDATIONS = new Set<string>();

export function SpaceAgentPicker({
  commit,
  hirePath,
  items,
  lockedKeys,
  onHire,
  recommendedKeys = NO_RECOMMENDATIONS,
  saving,
  selection,
}: {
  commit: (selection: SpaceSelection) => Promise<boolean>;
  /** Space-native hire. Absent when the viewer cannot hire. */
  hirePath?: string;
  items: SpaceCatalogItem[];
  lockedKeys: ReadonlySet<string>;
  onHire?: () => void;
  recommendedKeys?: ReadonlySet<string>;
  saving: boolean;
  selection: SpaceSelection;
}) {
  const { t } = useTranslation("common");
  const [query, setQuery] = useState("");
  const [detailsId, setDetailsId] = useState<string | null>(null);

  const pickable = useMemo(
    () =>
      // Only hired engenties are pickable: module agents mount WITH their
      // module (the Apps card is the lever) and platform agents are baseline.
      items.filter(
        (item) =>
          !lockedKeys.has(`agent:${item.id}`) &&
          item.source === "database" &&
          !item.managedByModule
      ),
    [items, lockedKeys]
  );
  const { items: agents, pending: searchPending } = useSpaceCatalogSearch(
    pickable,
    query
  );

  const selected = agents.filter((item) => selection.has(`agent:${item.id}`));
  const available = agents.filter((item) => !selection.has(`agent:${item.id}`));
  const recommended = available.filter((item) =>
    recommendedKeys.has(`agent:${item.id}`)
  );
  const otherAvailable = available.filter(
    (item) => !recommendedKeys.has(`agent:${item.id}`)
  );
  const details = agents.find((item) => item.id === detailsId) ?? null;
  const detailsKey = details ? `agent:${details.id}` : null;
  const detailsInSpace = detailsKey ? selection.has(detailsKey) : false;
  const detailsLocked = detailsKey ? lockedKeys.has(detailsKey) : false;

  const renderRow = (item: SpaceCatalogItem, isRecommended = false) => {
    const key = `agent:${item.id}`;
    return (
      <SpaceAgentRow
        inSpace={selection.has(key)}
        item={item}
        key={item.id}
        locked={lockedKeys.has(key)}
        onOpen={() => setDetailsId(item.id)}
        recommended={isRecommended}
        saving={saving}
      />
    );
  };

  return (
    <>
      {hirePath ? (
        <p className="mb-3 px-2 text-sm">
          <Link
            className="text-primary underline-offset-4 hover:underline"
            onClick={onHire}
            to={hirePath}
          >
            {t("spaces.agents.hire", { defaultValue: "Hire an agent" })}
          </Link>
        </p>
      ) : null}
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label={t("spaces.setup.agentSearch")}
          className="pl-8"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("spaces.setup.agentSearch")}
          type="search"
          value={query}
        />
      </div>

      <div className="mt-4 min-h-64 divide-y divide-border">
        {selected.length > 0 ? (
          <div className="pb-2">
            <p className="px-2 pb-1 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
              {t("spaces.setup.agentInSpaceSection")}
            </p>
            {selected.map((item) => renderRow(item))}
          </div>
        ) : null}
        {recommended.length > 0 ? (
          <div className="pt-3">
            <p className="px-2 pb-1 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
              {t("spaces.setup.recommendedSection")}
            </p>
            {recommended.map((item) => renderRow(item, true))}
          </div>
        ) : null}
        {otherAvailable.length > 0 ? (
          <div className="pt-3">
            <p className="px-2 pb-1 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
              {t("spaces.setup.agentAvailableSection")}
            </p>
            {byCategory(otherAvailable).flatMap(([, group]) =>
              group.map((item) => renderRow(item))
            )}
          </div>
        ) : null}
        {agents.length === 0 ? (
          <p className="px-2 py-8 text-center text-muted-foreground text-sm">
            {searchPending
              ? t("spaces.setup.catalogSearching")
              : t("spaces.setup.agentNoMatches")}
          </p>
        ) : null}
      </div>

      <SpaceAgentSetupDialog
        inSpace={detailsInSpace}
        item={details}
        onAdd={() =>
          details
            ? commit(
                toggleSelection(
                  selection,
                  { resourceKey: details.id, resourceType: "agent" },
                  true
                )
              )
            : Promise.resolve(false)
        }
        onOpenChange={(open) => {
          if (!open) {
            setDetailsId(null);
          }
        }}
        onRemove={
          details && detailsInSpace && !detailsLocked
            ? () =>
                commit(
                  toggleSelection(
                    selection,
                    { resourceKey: details.id, resourceType: "agent" },
                    false
                  )
                )
            : null
        }
        open={details !== null}
        required={detailsLocked}
        saving={saving}
      />
    </>
  );
}
