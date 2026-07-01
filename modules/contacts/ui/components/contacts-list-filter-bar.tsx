import {
  ListFilterSelectTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@engenty/ui-core";
import type { ContactRole } from "../api.js";

const ROLE_ALL_VALUE = "__all__";

export interface ContactsListFilterBarProps {
  filterByRoleLabel: string;
  onRoleChange: (role: ContactRole | "") => void;
  roleAllLabel: string;
  roleFilter: ContactRole | "";
  roleOptions: Array<{ value: string; label: string }>;
}

export function ContactsListFilterBar({
  filterByRoleLabel,
  onRoleChange,
  roleAllLabel,
  roleFilter,
  roleOptions,
}: ContactsListFilterBarProps) {
  const options = roleOptions.some((opt) => opt.value === roleFilter)
    ? roleOptions
    : roleFilter
      ? [...roleOptions, { value: roleFilter, label: roleFilter }]
      : roleOptions;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Select
        onValueChange={(v) =>
          onRoleChange(v === ROLE_ALL_VALUE ? "" : (v as ContactRole))
        }
        value={roleFilter && roleFilter !== "" ? roleFilter : ROLE_ALL_VALUE}
      >
        <ListFilterSelectTrigger className="w-[min(100%,11rem)] shrink-0 sm:w-[140px]">
          <SelectValue placeholder={filterByRoleLabel}>
            {roleFilter && roleFilter !== ""
              ? (options.find((o) => o.value === roleFilter)?.label ??
                roleFilter)
              : roleAllLabel}
          </SelectValue>
        </ListFilterSelectTrigger>
        <SelectContent
          align="start"
          avoidCollisions={false}
          position="popper"
          side="bottom"
          sideOffset={4}
        >
          <SelectItem value={ROLE_ALL_VALUE}>{roleAllLabel}</SelectItem>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
