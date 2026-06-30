import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { Button, cn, ListFilterChip } from "@engenty/ui-core";
import { ListFilter } from "lucide-react";
import { useMemo } from "react";
import { getContactsPluginApi, type TeamMemberCatalogRow } from "../plugins.js";
import { useProjectsList } from "../queries.js";
import {
  clearProjectListFilters,
  hasActiveProjectListFilters,
  type ProjectListFilterState,
  type ProjectListGroupBy,
  projectListGroupBySelectOptions,
} from "./project-list-filters.js";

interface ProjectListFilterBarProps {
  filtersExpanded: boolean;
  hasActiveChipFilters: boolean;
  onChange: (next: ProjectListFilterState) => void;
  teamMemberCatalog: TeamMemberCatalogRow[];
  value: ProjectListFilterState;
}

export function ProjectListFilterBar({
  value,
  onChange,
  filtersExpanded,
  hasActiveChipFilters,
  teamMemberCatalog,
}: ProjectListFilterBarProps) {
  const { t } = useTranslation("projects");
  const contactsPlugin = useMemo(() => getContactsPluginApi(), []);

  const contactsQuery = useQuery({
    queryKey: ["projects", "filter-contacts"],
    queryFn: ({ signal }) =>
      contactsPlugin?.getContacts({ pageSize: 100 }, signal) ??
      Promise.resolve([]),
    enabled: !!contactsPlugin && filtersExpanded,
  });

  const allProjectsQuery = useProjectsList({
    page: 1,
    pageSize: 200,
  });

  const clients = contactsQuery.data ?? [];
  const allProjects = allProjectsQuery.data?.data ?? [];

  const activeLeadIds = useMemo(
    () =>
      new Set(allProjects.map((p) => p.lead_id).filter(Boolean) as string[]),
    [allProjects]
  );

  const clientOptions = useMemo(
    () => [
      { value: "__all__", label: t("filters.allClients") },
      ...clients.map((c) => ({
        value: c.id,
        label: c.display_name,
      })),
    ],
    [clients, t]
  );

  const leadOptions = useMemo(() => {
    const activeLeads = teamMemberCatalog.filter(
      (m) => m.user_id && activeLeadIds.has(m.user_id)
    );
    return [
      { value: "__all__", label: t("filters.allLeads") },
      ...activeLeads.map((m) => ({
        value: m.user_id!,
        label: m.full_name,
      })),
    ];
  }, [teamMemberCatalog, activeLeadIds, t]);

  const groupByOptions = projectListGroupBySelectOptions(t);

  const selectedClientLabel = useMemo(
    () =>
      clientOptions.find(
        (option) => option.value === (value.clientId ?? "__all__")
      )?.label,
    [clientOptions, value.clientId]
  );

  const selectedLeadLabel = useMemo(
    () =>
      leadOptions.find((option) => option.value === (value.leadId ?? "__all__"))
        ?.label,
    [leadOptions, value.leadId]
  );

  const selectedGroupByLabel = useMemo(
    () =>
      groupByOptions.find((option) => option.value === value.groupBy)?.label,
    [groupByOptions, value.groupBy]
  );

  const showClearAll = hasActiveProjectListFilters(value);

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
          onChange({ ...value, groupBy: groupBy as ProjectListGroupBy })
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

      {contactsPlugin && (
        <ListFilterChip
          activeLabel={selectedClientLabel}
          ariaLabel={t("filters.client")}
          clearLabel={t("filters.clearClient")}
          isActive={!!value.clientId}
          label={t("filters.client")}
          onClear={() => onChange({ ...value, clientId: undefined })}
          onSelect={(clientId) =>
            onChange({
              ...value,
              clientId: clientId === "__all__" ? undefined : clientId,
            })
          }
          options={clientOptions}
          value={value.clientId ?? "__all__"}
        />
      )}

      <ListFilterChip
        activeLabel={selectedLeadLabel}
        ariaLabel={t("filters.lead")}
        clearLabel={t("filters.clearLead")}
        isActive={!!value.leadId}
        label={t("filters.lead")}
        onClear={() => onChange({ ...value, leadId: undefined })}
        onSelect={(leadId) =>
          onChange({
            ...value,
            leadId: leadId === "__all__" ? undefined : leadId,
          })
        }
        options={leadOptions}
        value={value.leadId ?? "__all__"}
      />

      {showClearAll ? (
        <Button
          className="h-8 px-2 text-sm"
          onClick={() => onChange(clearProjectListFilters())}
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
