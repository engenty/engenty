import { useTranslation } from "@engenty/i18n/ui";
import type { MultiSelectGroup, MultiSelectOption } from "@engenty/ui-core";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
  ComboboxValue,
  Label,
} from "@engenty/ui-core";
import { Fragment, type ReactNode, useMemo } from "react";
import {
  buildTaskAssigneeMemberOptions,
  teamMemberCatalogUserId,
} from "../lib/team-catalog-ui.js";
import type { TeamMemberCatalogRow } from "../plugins.js";

function isOptionGroup(
  options: MultiSelectOption[] | MultiSelectGroup[]
): options is MultiSelectGroup[] {
  return options.length > 0 && "heading" in options[0];
}

function flattenOptions(
  options: MultiSelectOption[] | MultiSelectGroup[]
): MultiSelectOption[] {
  if (options.length === 0) {
    return [];
  }
  if (isOptionGroup(options)) {
    return options.flatMap((group) => group.options);
  }
  return options;
}

function optionForId(
  id: string,
  flatOptions: MultiSelectOption[],
  catalog: TeamMemberCatalogRow[]
): MultiSelectOption {
  const fromOptions = flatOptions.find((option) => option.value === id);
  if (fromOptions) {
    return fromOptions;
  }
  const member = catalog.find(
    (row) => row.id === id || teamMemberCatalogUserId(row) === id
  );
  if (member) {
    return { label: member.full_name, value: id };
  }
  return { label: id, value: id };
}

function AssigneeOptionCopy({ option }: { option: MultiSelectOption }) {
  const secondary = option.description?.trim();
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate font-medium">{option.label}</span>
      {secondary ? (
        <span className="truncate text-muted-foreground text-xs">
          {secondary}
        </span>
      ) : null}
    </span>
  );
}

function AssigneeComboboxFields({
  children,
  disabled,
  emptyLabel,
  placeholder,
  selectedItems,
}: {
  children: ReactNode;
  disabled?: boolean;
  emptyLabel: string;
  placeholder: string;
  selectedItems: MultiSelectOption[];
}) {
  return (
    <>
      <ComboboxChips>
        <ComboboxValue>
          {selectedItems.map((item) => (
            <ComboboxChip key={item.value}>{item.label}</ComboboxChip>
          ))}
        </ComboboxValue>
        <ComboboxChipsInput disabled={disabled} placeholder={placeholder} />
      </ComboboxChips>
      <ComboboxContent>
        <ComboboxEmpty>{emptyLabel}</ComboboxEmpty>
        {children}
      </ComboboxContent>
    </>
  );
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
  const resolvedPlaceholder = placeholder ?? t("form.selectCollaborators");
  const emptyLabel = t("form.assigneeNoMatch");

  const resolvedOptions = useMemo(
    () => options ?? buildTaskAssigneeMemberOptions(catalog),
    [catalog, options]
  );
  const flatOptions = useMemo(
    () => flattenOptions(resolvedOptions),
    [resolvedOptions]
  );
  const groupedItems = useMemo(() => {
    if (!isOptionGroup(resolvedOptions)) {
      return null;
    }
    return resolvedOptions.map((group) => ({
      heading: group.heading,
      items: group.options,
    }));
  }, [resolvedOptions]);
  const selectedItems = useMemo(
    () => selectedIds.map((id) => optionForId(id, flatOptions, catalog)),
    [catalog, flatOptions, selectedIds]
  );

  const comboboxProps = {
    autoHighlight: true,
    disabled,
    isItemEqualToValue: (left: MultiSelectOption, right: MultiSelectOption) =>
      left.value === right.value,
    itemToStringLabel: (item: MultiSelectOption) =>
      [item.label, item.description]
        .filter((part): part is string => Boolean(part?.trim()))
        .join(" "),
    multiple: true as const,
    onValueChange: (next: MultiSelectOption[]) => {
      onSelectedIdsChange(next.map((item) => item.value));
    },
    value: selectedItems,
  };

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
        flatOptions.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("form.assigneeNoMembers")}
          </p>
        ) : groupedItems ? (
          <Combobox {...comboboxProps} items={groupedItems}>
            <AssigneeComboboxFields
              disabled={disabled}
              emptyLabel={emptyLabel}
              placeholder={resolvedPlaceholder}
              selectedItems={selectedItems}
            >
              <ComboboxList>
                {(
                  group: { heading: string; items: MultiSelectOption[] },
                  index: number
                ) => (
                  <Fragment key={group.heading}>
                    {index > 0 ? <ComboboxSeparator /> : null}
                    <ComboboxGroup items={group.items}>
                      <ComboboxLabel>{group.heading}</ComboboxLabel>
                      <ComboboxCollection>
                        {(item: MultiSelectOption) => (
                          <ComboboxItem key={item.value} value={item}>
                            <AssigneeOptionCopy option={item} />
                          </ComboboxItem>
                        )}
                      </ComboboxCollection>
                    </ComboboxGroup>
                  </Fragment>
                )}
              </ComboboxList>
            </AssigneeComboboxFields>
          </Combobox>
        ) : (
          <Combobox {...comboboxProps} items={flatOptions}>
            <AssigneeComboboxFields
              disabled={disabled}
              emptyLabel={emptyLabel}
              placeholder={resolvedPlaceholder}
              selectedItems={selectedItems}
            >
              <ComboboxList>
                {(item: MultiSelectOption) => (
                  <ComboboxItem key={item.value} value={item}>
                    <AssigneeOptionCopy option={item} />
                  </ComboboxItem>
                )}
              </ComboboxList>
            </AssigneeComboboxFields>
          </Combobox>
        )
      ) : (
        <p className="text-muted-foreground text-sm">
          {t("form.assigneeTeamMembersUnavailable")}
        </p>
      )}
    </div>
  );
}
