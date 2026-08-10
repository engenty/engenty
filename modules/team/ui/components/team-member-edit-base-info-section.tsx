import {
  Card,
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
import { type Control, type Path, useWatch } from "react-hook-form";
import { useTeamMemberTaxonomyTerms } from "../hooks/use-team-member-taxonomy-terms.js";
import {
  previewDisplayNameFromForm,
  type TeamProfileNameFormFields,
} from "../lib/team-profile-name-form.js";
import { TeamMemberBaseInfoSectionShell } from "./team-member-base-info-section-shell.js";
import { TeamMemberNameFields } from "./team-member-name-fields.js";
import { TeamMemberReportsToField } from "./team-member-reports-to-field.js";
import { ROLE_NONE } from "./team-member-role-field.js";

export const LOCATION_NONE = "__none__";

export type TeamMemberEditBaseInfoValues = TeamProfileNameFormFields & {
  email: string | null;
  location_term_id: string;
  reports_to_id: string;
  role_term_id: string;
};

function baseInfoField<T extends TeamMemberEditBaseInfoValues>(
  name: keyof TeamMemberEditBaseInfoValues & string
): Path<T> {
  return name as Path<T>;
}

interface TeamMemberEditBaseInfoSectionProps<
  T extends TeamMemberEditBaseInfoValues,
> {
  control: Control<T>;
  excludeProfileId: string;
  onApplyNameSplit?: (parts: Partial<TeamProfileNameFormFields>) => void;
  splitSourceLabel?: string;
  t: (key: string) => string;
}

export function TeamMemberEditBaseInfoSection<
  T extends TeamMemberEditBaseInfoValues,
>({
  control,
  excludeProfileId,
  onApplyNameSplit,
  splitSourceLabel,
  t,
}: TeamMemberEditBaseInfoSectionProps<T>) {
  const { locationTerms, roleTerms } = useTeamMemberTaxonomyTerms();
  const nameValues = useWatch({ control }) as TeamProfileNameFormFields;
  const displayPreview = previewDisplayNameFromForm(nameValues);
  const nameSectionTitle = displayPreview
    ? `${t("nameSection")}: ${displayPreview}`
    : t("nameSection");

  // Resolve labels eagerly so SelectValue shows them even before
  // SelectContent mounts (Radix portal lazy-loading issue).
  const currentValues = useWatch({ control }) as TeamMemberEditBaseInfoValues;
  const resolvedRoleLabel =
    currentValues.role_term_id === ROLE_NONE || !currentValues.role_term_id
      ? t("noRole")
      : (roleTerms.find((r) => r.id === currentValues.role_term_id)?.label ??
        t("selectRole"));
  const resolvedLocationLabel =
    currentValues.location_term_id === LOCATION_NONE ||
    !currentValues.location_term_id
      ? t("noLocation")
      : (locationTerms.find((l) => l.id === currentValues.location_term_id)
          ?.label ?? t("selectLocation"));

  return (
    <TeamMemberBaseInfoSectionShell t={t}>
      <div className="space-y-4">
        <div className="space-y-2">
          <h3 className="font-medium text-base">{nameSectionTitle}</h3>
          <Card variant="form">
            <TeamMemberNameFields
              control={control}
              onApplySplit={onApplyNameSplit}
              splitSourceLabel={splitSourceLabel}
              t={t}
            />
          </Card>
        </div>
        <Card variant="form">
          <FormField
            control={control}
            name={baseInfoField<T>("email")}
            render={({ field }) => (
              <FormItem variant="row">
                <FormLabel>{t("email")}</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    {...field}
                    value={(field.value as string | null) ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name={baseInfoField<T>("role_term_id")}
            render={({ field }) => (
              <FormItem variant="row">
                <FormLabel>{t("profileRole")}</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value as string}
                >
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
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name={baseInfoField<T>("location_term_id")}
            render={({ field }) => (
              <FormItem variant="row">
                <FormLabel>{t("location")}</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value as string}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={resolvedLocationLabel} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={LOCATION_NONE}>
                      {t("noLocation")}
                    </SelectItem>
                    {locationTerms.map((term) => (
                      <SelectItem key={term.id} value={term.id}>
                        {term.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <TeamMemberReportsToField
            control={control}
            excludeProfileId={excludeProfileId}
            name={baseInfoField<T>("reports_to_id")}
            t={t}
          />
        </Card>
      </div>
    </TeamMemberBaseInfoSectionShell>
  );
}
