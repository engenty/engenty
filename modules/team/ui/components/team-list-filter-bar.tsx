import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { Button, cn, ListFilterChip } from "@engenty/ui-core";
import { ListFilter } from "lucide-react";
import {
  teamFilterOptionsQueryOptions,
  teamGroupsQueryOptions,
} from "../team-module-queries.js";
import {
  clearTeamListFilters,
  hasActiveTeamListFilters,
  type TeamListFilterState,
  type TeamListGroupBy,
  teamListGroupBySelectOptions,
} from "./team-list-filters.js";

interface TeamListFilterBarProps {
  filtersExpanded: boolean;
  hasActiveChipFilters: boolean;
  onChange: (next: TeamListFilterState) => void;
  value: TeamListFilterState;
}

export function TeamListFilterBar({
  value,
  onChange,
  filtersExpanded,
  hasActiveChipFilters,
}: TeamListFilterBarProps) {
  const { t } = useTranslation("team");
  const filterQuery = useQuery(teamFilterOptionsQueryOptions());
  const groupsQuery = useQuery(teamGroupsQueryOptions());
  const taxonomyGroups = filterQuery.data ?? [];
  const teamGroups = groupsQuery.data ?? [];

  const roleGroup = taxonomyGroups.find((g) => g.taxonomy.slug === "role");
  const locationGroup = taxonomyGroups.find(
    (g) => g.taxonomy.slug === "location"
  );

  const roleOptions = [
    { value: "__all__", label: t("filters.allRoles") },
    ...(roleGroup?.terms ?? []).map((term) => ({
      value: term.id,
      label: term.label,
    })),
  ];
  const locationOptions = [
    { value: "__all__", label: t("filters.allLocations") },
    ...(locationGroup?.terms ?? []).map((term) => ({
      value: term.id,
      label: term.label,
    })),
  ];
  const groupOptions = [
    { value: "__all__", label: t("filters.allGroups") },
    ...teamGroups.map((group) => ({
      value: group.id,
      label: group.name,
    })),
  ];
  const groupByOptions = teamListGroupBySelectOptions(t);

  const selectedRoleLabel = roleOptions.find(
    (option) => option.value === (value.roleTermId ?? "__all__")
  )?.label;
  const selectedLocationLabel = locationOptions.find(
    (option) => option.value === (value.locationTermId ?? "__all__")
  )?.label;
  const selectedGroupLabel = groupOptions.find(
    (option) => option.value === (value.groupId ?? "__all__")
  )?.label;
  const selectedGroupByLabel = groupByOptions.find(
    (option) => option.value === value.groupBy
  )?.label;

  const showClearAll = hasActiveTeamListFilters(value);

  if (!filtersExpanded) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="shrink-0 text-muted-foreground text-sm">
        {t("filters.groupBy")}
      </span>
      <ListFilterChip
        activeLabel={selectedGroupByLabel}
        ariaLabel={t("filters.groupBy")}
        clearLabel={t("filters.clearGroupBy")}
        isActive={value.groupBy !== "none"}
        label={t("filters.groupByNone")}
        onClear={() => onChange({ ...value, groupBy: "none" })}
        onSelect={(groupBy) =>
          onChange({ ...value, groupBy: groupBy as TeamListGroupBy })
        }
        options={groupByOptions}
        value={value.groupBy}
      />

      <span
        aria-hidden
        className="hidden h-4 w-px shrink-0 bg-border sm:block"
      />

      <span
        aria-hidden
        className={cn(
          "inline-flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground",
          hasActiveChipFilters && "text-foreground"
        )}
      >
        <span className="relative inline-flex">
          <ListFilter className="h-4 w-4" />
          {hasActiveChipFilters ? (
            <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-primary" />
          ) : null}
        </span>
      </span>

      <ListFilterChip
        activeLabel={selectedRoleLabel}
        ariaLabel={t("filters.role")}
        clearLabel={t("filters.clearRole")}
        isActive={!!value.roleTermId}
        label={t("filters.role")}
        onClear={() => onChange({ ...value, roleTermId: undefined })}
        onSelect={(roleTermId) =>
          onChange({
            ...value,
            roleTermId: roleTermId === "__all__" ? undefined : roleTermId,
          })
        }
        options={roleOptions}
        value={value.roleTermId ?? "__all__"}
      />

      <ListFilterChip
        activeLabel={selectedLocationLabel}
        ariaLabel={t("filters.location")}
        clearLabel={t("filters.clearLocation")}
        isActive={!!value.locationTermId}
        label={t("filters.location")}
        onClear={() => onChange({ ...value, locationTermId: undefined })}
        onSelect={(locationTermId) =>
          onChange({
            ...value,
            locationTermId:
              locationTermId === "__all__" ? undefined : locationTermId,
          })
        }
        options={locationOptions}
        value={value.locationTermId ?? "__all__"}
      />

      <ListFilterChip
        activeLabel={selectedGroupLabel}
        ariaLabel={t("filters.group")}
        clearLabel={t("filters.clearGroup")}
        isActive={!!value.groupId}
        label={t("filters.group")}
        onClear={() => onChange({ ...value, groupId: undefined })}
        onSelect={(groupId) =>
          onChange({
            ...value,
            groupId: groupId === "__all__" ? undefined : groupId,
          })
        }
        options={groupOptions}
        value={value.groupId ?? "__all__"}
      />

      {showClearAll ? (
        <Button
          className="h-8 px-2 text-sm"
          onClick={() => onChange(clearTeamListFilters())}
          size="sm"
          type="button"
          variant="link"
        >
          {t("filters.clearAll")}
        </Button>
      ) : null}
    </div>
  );
}
