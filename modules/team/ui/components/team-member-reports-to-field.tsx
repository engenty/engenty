import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { useTeamManagerPickerOptions } from "../hooks/use-team-manager-picker-options.js";
import { MANAGER_NONE } from "../lib/team-manager-picker.js";

interface TeamMemberReportsToFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> {
  control: Control<TFieldValues>;
  enabled?: boolean;
  excludeProfileId: string | null;
  layout?: "row" | "stack";
  name: TName;
  t: (key: string) => string;
}

export function TeamMemberReportsToField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  name,
  t,
  excludeProfileId,
  enabled = true,
  layout = "row",
}: TeamMemberReportsToFieldProps<TFieldValues, TName>) {
  const { isLoading, options } = useTeamManagerPickerOptions(
    excludeProfileId,
    enabled
  );

  // Resolve label eagerly — Radix SelectValue can't find item text until
  // SelectContent mounts (portal lazy-loading), so pass as placeholder.
  const resolvedManagerLabel = (fieldValue: string) => {
    if (!fieldValue || fieldValue === MANAGER_NONE) {
      return t("noManager");
    }
    return (
      options.find((o) => o.org_node_id === fieldValue)?.display_name ??
      t("selectManager")
    );
  };

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem variant={layout === "row" ? "row" : undefined}>
          <FormLabel>{t("reportsTo")}</FormLabel>
          <Select
            disabled={isLoading}
            onValueChange={field.onChange}
            value={field.value}
          >
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder={resolvedManagerLabel(field.value)} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value={MANAGER_NONE}>{t("noManager")}</SelectItem>
              {options.map((option) => (
                <SelectItem key={option.org_node_id} value={option.org_node_id}>
                  {option.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
