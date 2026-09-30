import { Tabs, TabsList, TabsTrigger } from "@engenty/ui-core";
import type { ContactRole } from "../api.js";

const ROLE_ALL_VALUE = "__all__";

export interface ContactsListFilterBarProps {
  filterByRoleLabel: string;
  onRoleChange: (role: ContactRole | "") => void;
  roleAllLabel: string;
  roleFilter: ContactRole | "";
  roleOptions: Array<{ value: string; label: string }>;
}

/** Role filter as a button group: All, then the tenant's visible roles. */
export function ContactsListFilterBar({
  filterByRoleLabel,
  onRoleChange,
  roleAllLabel,
  roleFilter,
  roleOptions,
}: ContactsListFilterBarProps) {
  // A role from the URL that the menu hides still gets its button.
  const options =
    roleFilter && !roleOptions.some((opt) => opt.value === roleFilter)
      ? [...roleOptions, { value: roleFilter, label: roleFilter }]
      : roleOptions;

  return (
    <Tabs
      className="min-w-0 max-w-full overflow-x-auto"
      onValueChange={(v) =>
        onRoleChange(v === ROLE_ALL_VALUE ? "" : (v as ContactRole))
      }
      value={roleFilter || ROLE_ALL_VALUE}
    >
      <TabsList aria-label={filterByRoleLabel} className="w-fit">
        <TabsTrigger value={ROLE_ALL_VALUE}>{roleAllLabel}</TabsTrigger>
        {options.map((opt) => (
          <TabsTrigger key={opt.value} value={opt.value}>
            {opt.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
