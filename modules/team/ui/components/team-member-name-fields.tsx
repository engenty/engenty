import {
  Button,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from "@engenty/ui-core";
import { RefreshCw } from "lucide-react";
import {
  type Control,
  type FieldValues,
  type Path,
  useWatch,
} from "react-hook-form";
import {
  applySplitFullNameToFormFields,
  previewDisplayNameFromForm,
  type TeamProfileNameFormFields,
} from "../lib/team-profile-name-form.js";

type NameFieldKeys = keyof TeamProfileNameFormFields;

interface TeamMemberNameFieldsProps<
  T extends FieldValues & TeamProfileNameFormFields,
> {
  control: Control<T>;
  onApplySplit?: (parts: Partial<TeamProfileNameFormFields>) => void;
  splitSourceLabel?: string;
  t: (key: string) => string;
}

function nameField<T extends FieldValues & TeamProfileNameFormFields>(
  name: NameFieldKeys
): Path<T> {
  return name as Path<T>;
}

const nameRowFieldClass =
  "border-border-soft border-b px-3 py-2.5 last:border-b-0";

export function TeamMemberNameFields<
  T extends FieldValues & TeamProfileNameFormFields,
>({
  control,
  onApplySplit,
  splitSourceLabel,
  t,
}: TeamMemberNameFieldsProps<T>) {
  const nameValues = useWatch({ control }) as TeamProfileNameFormFields;
  const displayPreview = previewDisplayNameFromForm(nameValues);
  const useCustomDisplay = nameValues.custom_display_name;

  return (
    <div className="space-y-0">
      {onApplySplit && splitSourceLabel ? (
        <div className="flex justify-end border-border-soft border-b px-3 py-2">
          <Button
            className="h-8 gap-1.5 text-xs"
            onClick={() =>
              onApplySplit(applySplitFullNameToFormFields(splitSourceLabel))
            }
            type="button"
            variant="ghost"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t("splitNameFromSource")}
          </Button>
        </div>
      ) : null}

      {useCustomDisplay ? (
        <FormField
          control={control}
          name={nameField<T>("full_name_override")}
          render={({ field }) => (
            <FormItem className={nameRowFieldClass} variant="row">
              <FormLabel>{t("displayName")}</FormLabel>
              <FormControl>
                <Input {...field} autoFocus value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : (
        <div
          className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4 ${nameRowFieldClass}`}
        >
          <span className="shrink-0 font-medium text-sm sm:w-32 md:w-40">
            {t("displayName")}
          </span>
          <span className="min-w-0 flex-1 font-medium text-sm">
            {displayPreview || "—"}
          </span>
        </div>
      )}

      <FormField
        control={control}
        name={nameField<T>("name_prefix")}
        render={({ field }) => (
          <FormItem className={nameRowFieldClass} variant="row">
            <FormLabel>{t("namePrefix")}</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ""} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name={nameField<T>("first_name")}
        render={({ field }) => (
          <FormItem className={nameRowFieldClass} variant="row">
            <FormLabel>{t("firstName")}</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ""} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name={nameField<T>("middle_name")}
        render={({ field }) => (
          <FormItem className={nameRowFieldClass} variant="row">
            <FormLabel>{t("middleName")}</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ""} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name={nameField<T>("last_name")}
        render={({ field }) => (
          <FormItem className={nameRowFieldClass} variant="row">
            <FormLabel>{t("lastName")}</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ""} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name={nameField<T>("name_suffix")}
        render={({ field }) => (
          <FormItem className={nameRowFieldClass} variant="row">
            <FormLabel>{t("nameSuffix")}</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ""} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name={nameField<T>("phonetic_name")}
        render={({ field }) => (
          <FormItem className={nameRowFieldClass} variant="row">
            <FormLabel>{t("phoneticName")}</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ""} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name={nameField<T>("birth_name")}
        render={({ field }) => (
          <FormItem className={nameRowFieldClass} variant="row">
            <FormLabel>{t("birthName")}</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ""} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name={nameField<T>("custom_display_name")}
        render={({ field }) => (
          <div className="flex items-center border-border-soft border-t px-3 py-2">
            {field.value ? (
              <button
                className="text-muted-foreground text-xs hover:text-foreground"
                onClick={() => field.onChange(false)}
                type="button"
              >
                {t("resetDisplayName")}
              </button>
            ) : (
              <button
                className="text-primary text-xs underline-offset-2 hover:underline"
                onClick={() => field.onChange(true)}
                type="button"
              >
                {t("customDisplayName")}
              </button>
            )}
          </div>
        )}
      />
    </div>
  );
}
