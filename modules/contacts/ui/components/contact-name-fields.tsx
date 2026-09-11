import {
  Button,
  CardSection,
  Checkbox,
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
  applySplitFullNameToContactFormFields,
  type ContactProfileNameFormFields,
  previewDisplayNameFromForm,
} from "../lib/contact-profile-name-form.js";

type NameFieldKeys = keyof ContactProfileNameFormFields;

interface ContactNameFieldsProps<
  T extends FieldValues & ContactProfileNameFormFields,
> {
  control: Control<T>;
  labelColClassName: string;
  onApplySplit?: (parts: Partial<ContactProfileNameFormFields>) => void;
  splitSourceLabel?: string;
  t: (key: string) => string;
}

function nameField<T extends FieldValues & ContactProfileNameFormFields>(
  name: NameFieldKeys
): Path<T> {
  return name as Path<T>;
}

const nameRowFieldClass =
  "border-border-soft border-b px-3 py-2.5 last:border-b-0";

export function ContactNameFields<
  T extends FieldValues & ContactProfileNameFormFields,
>({
  control,
  labelColClassName,
  onApplySplit,
  splitSourceLabel,
  t,
}: ContactNameFieldsProps<T>) {
  const nameValues = useWatch({ control }) as ContactProfileNameFormFields;
  const displayPreview = previewDisplayNameFromForm(nameValues);
  const useCustomDisplay = nameValues.custom_display_name;

  const rowLabel = (label: string) => (
    <FormLabel className={labelColClassName}>{label}</FormLabel>
  );

  return (
    <CardSection cardVariant="flush" title={t("nameSection")}>
      <div className="space-y-0">
        {onApplySplit && splitSourceLabel ? (
          <div className="flex justify-end border-border-soft border-b px-3 py-2">
            <Button
              className="h-8 gap-1.5 text-xs"
              onClick={() =>
                onApplySplit(
                  applySplitFullNameToContactFormFields(splitSourceLabel)
                )
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
            name={nameField<T>("display_name_override")}
            render={({ field }) => (
              <FormItem
                className={`flex items-start gap-4 ${nameRowFieldClass}`}
              >
                {rowLabel(t("displayName"))}
                <div className="min-w-0 flex-1 space-y-2">
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </div>
              </FormItem>
            )}
          />
        ) : (
          <div
            className={`flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4 ${nameRowFieldClass}`}
          >
            <span className={labelColClassName}>{t("displayName")}</span>
            <span className="min-w-0 flex-1 pt-1.5 font-medium text-sm">
              {displayPreview || "—"}
            </span>
          </div>
        )}

        {(
          [
            ["name_prefix", "namePrefix"],
            ["first_name", "firstName"],
            ["middle_name", "middleName"],
            ["last_name", "lastName"],
            ["name_suffix", "nameSuffix"],
            ["phonetic_name", "phoneticName"],
            ["birth_name", "birthName"],
          ] as const
        ).map(([key, labelKey]) => (
          <FormField
            control={control}
            key={key}
            name={nameField<T>(key)}
            render={({ field }) => (
              <FormItem
                className={`flex items-start gap-4 ${nameRowFieldClass}`}
              >
                {rowLabel(t(labelKey))}
                <div className="min-w-0 flex-1 space-y-2">
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                  {key === "last_name" ? <FormMessage /> : null}
                </div>
              </FormItem>
            )}
          />
        ))}

        <FormField
          control={control}
          name={nameField<T>("custom_display_name")}
          render={({ field }) => (
            <FormItem className="flex items-center gap-2.5 border-border-soft border-t px-3 py-2.5">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <FormLabel className="!mt-0 font-normal leading-none">
                {t("customDisplayName")}
              </FormLabel>
            </FormItem>
          )}
        />
      </div>
    </CardSection>
  );
}
