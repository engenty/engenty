import { useTranslation } from "@engenty/i18n/ui";
import type { MultiSelectGroup, MultiSelectOption } from "@engenty/ui-core";
import { Label, MultiSelect } from "@engenty/ui-core";
import { useMemo } from "react";
import { buildTaskAssigneeMemberOptions } from "../lib/team-catalog-ui.js";
import type { TeamMemberCatalogRow } from "../plugins.js";

function countSelectableOptions(
  options: MultiSelectOption[] | MultiSelectGroup[]
): number {
  if (options.length === 0) {
    return 0;
  }
  if ("heading" in options[0]) {
    return (options as MultiSelectGroup[]).reduce(
      (total, group) => total + group.options.length,
      0
    );
  }
  return (options as MultiSelectOption[]).length;
}

export interface TaskCollaboratorsPickerProps {
  catalog: TeamMemberCatalogRow[];
  disabled?: boolean;
  error?: string | null;
  label?: string;
  loading?: boolean;
  onSelectedIdsChange: (ids: string[]) => void;
  options?: MultiSelectOption[] | MultiSelectGroup[];
  placeholder?: string;
  selectedIds: string[];
  teamMembersEnabled?: boolean;
}

export function TaskCollaboratorsPicker({
  catalog,
  selectedIds,
  onSelectedIdsChange,
  options,
  disabled,
  loading = false,
  error = null,
  teamMembersEnabled = true,
  label,
  placeholder,
}: TaskCollaboratorsPickerProps) {
  const { t } = useTranslation("tasks");

  const resolvedOptions = useMemo(
    () => options ?? buildTaskAssigneeMemberOptions(catalog),
    [catalog, options]
  );
  const selectableCount = useMemo(
    () => countSelectableOptions(resolvedOptions),
    [resolvedOptions]
  );

  return (
    <div className="space-y-2">
      <Label>{label ?? t("form.collaborators")}</Label>
      {loading ? (
        <p className="text-muted-foreground text-sm">
          {t("form.assigneeLoading")}
        </p>
      ) : error ? (
        <p className="text-destructive text-sm">{error}</p>
      ) : teamMembersEnabled ? (
        selectableCount === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("form.assigneeNoMembers")}
          </p>
        ) : (
          <MultiSelect
            className="w-full min-w-0"
            deduplicateOptions
            defaultValue={selectedIds}
            disabled={disabled}
            hideSelectAll={selectableCount === 0}
            onValueChange={onSelectedIdsChange}
            options={resolvedOptions}
            placeholder={placeholder ?? t("form.selectCollaborators")}
          />
        )
      ) : (
        <p className="text-muted-foreground text-sm">
          {t("form.assigneeTeamMembersUnavailable")}
        </p>
      )}
    </div>
  );
}
