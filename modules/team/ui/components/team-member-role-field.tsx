import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { useWatch } from "react-hook-form";
import type { TeamTaxonomyTerm } from "../api.js";
import { resolveTaxonomyTermSlug } from "../lib/taxonomy-term-save.js";

export const ROLE_NONE = "__none__";
export const ROLE_ADD_NEW = "__add_new__";

interface TeamMemberRoleFieldProps<T extends FieldValues> {
  control: Control<T>;
  newRoleLabelName: FieldPath<T>;
  newRoleSlugName: FieldPath<T>;
  roleSelectionName: FieldPath<T>;
  roleTerms: TeamTaxonomyTerm[];
  t: (key: string) => string;
}

export function TeamMemberRoleField<T extends FieldValues>({
  control,
  roleSelectionName,
  newRoleLabelName,
  newRoleSlugName,
  roleTerms,
  t,
}: TeamMemberRoleFieldProps<T>) {
  const roleSelection = useWatch({
    control,
    name: roleSelectionName,
  }) as string;
  const newRoleLabel = useWatch({ control, name: newRoleLabelName }) as string;
  const newRoleSlug = useWatch({ control, name: newRoleSlugName }) as string;
  const derivedSlug = resolveTaxonomyTermSlug({
    label: newRoleLabel ?? "",
    term_slug: newRoleSlug ?? "",
  });

  // Resolve label eagerly — Radix SelectValue can't read item text until
  // SelectContent mounts (portal lazy-loading), so pass as placeholder.
  const resolvedRoleLabel =
    !roleSelection || roleSelection === ROLE_NONE
      ? t("noRole")
      : roleSelection === ROLE_ADD_NEW
        ? t("addNewRole")
        : (roleTerms.find((r) => r.id === roleSelection)?.label ??
          t("selectRole"));

  return (
    <div className="space-y-4">
      <FormField
        control={control}
        name={roleSelectionName}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("profileRole")}</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder={resolvedRoleLabel} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value={ROLE_NONE}>{t("noRole")}</SelectItem>
                {roleTerms.map((term) => (
                  <SelectItem key={term.id} value={term.id}>
                    {term.label}
                  </SelectItem>
                ))}
                <SelectItem value={ROLE_ADD_NEW}>{t("addNewRole")}</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
      {roleSelection === ROLE_ADD_NEW ? (
        <div className="space-y-4 rounded-lg border p-4">
          <FormField
            control={control}
            name={newRoleLabelName}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("newRoleName")}</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name={newRoleSlugName}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("newRoleSlug")}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder={derivedSlug || t("newRoleSlugPlaceholder")}
                  />
                </FormControl>
                <p className="text-muted-foreground text-xs">
                  {t("newRoleSlugHint")}
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      ) : null}
    </div>
  );
}
