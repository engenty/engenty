import {
  Card,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  MultiSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { useFeatureFlags } from "@engenty/ui-plugin-sdk";
import { useEffect, useMemo } from "react";
import type { UseFormReturn } from "react-hook-form";
import { FIXED_CONTACT_ROLES } from "../api/role-menu-settings.js";
import { useContactsRoleOptions } from "../hooks/use-contacts-role-options.js";
import type { ContactCreateFormValues } from "../pages/contact-form.js";
import { ContactNameFields } from "./contact-name-fields.js";

/** Wide enough for long DE/EN labels; `items-start` rows align with `h-8` inputs. */
const contactFormLabelColClassName =
  "w-52 shrink-0 pt-1.5 text-start text-sm leading-snug sm:w-56 md:w-60";

interface ContactFormFieldsProps {
  form: UseFormReturn<ContactCreateFormValues>;
  showValidationOnOptional?: boolean;
  t: (key: string) => string;
}

type ContactFormStringFieldName = {
  [K in keyof ContactCreateFormValues]: ContactCreateFormValues[K] extends string
    ? K
    : never;
}[keyof ContactCreateFormValues];

export function ContactFormFields({
  form,
  t,
  showValidationOnOptional = true,
}: ContactFormFieldsProps) {
  const { resolved } = useFeatureFlags();
  const organisationEnabled =
    resolved?.["contacts.organisation_accounts"] !== false;
  const personalEnabled = resolved?.["contacts.personal_accounts"] !== false;
  const typeOptions = [
    organisationEnabled && { value: "organisation", label: t("organisation") },
    personalEnabled && { value: "person", label: t("person") },
  ].filter(Boolean) as Array<{ value: string; label: string }>;
  const hasMultipleTypes = typeOptions.length > 1;
  const isPerson = form.watch("type") === "person";
  const splitSourceLabel =
    form.watch("display_name")?.trim() ||
    form.watch("legal_name")?.trim() ||
    "";
  const roleOptions = useContactsRoleOptions();
  const roleSelectOptions = useMemo(
    () =>
      roleOptions.map((item) => ({
        value: item.slug,
        label:
          item.title?.trim() ||
          (FIXED_CONTACT_ROLES.includes(
            item.slug as (typeof FIXED_CONTACT_ROLES)[number]
          )
            ? t(`role.${item.slug}`)
            : item.slug),
      })),
    [roleOptions, t]
  );

  useEffect(() => {
    const current = form.getValues("type");
    const valid = typeOptions.some((o) => o.value === current);
    if (!valid && typeOptions.length > 0) {
      form.setValue("type", typeOptions[0].value as "organisation" | "person");
    }
  }, [form, typeOptions]);

  const row = (
    name: ContactFormStringFieldName,
    label: string,
    required = false
  ) => (
    <FormField
      control={form.control}
      key={name}
      name={name}
      render={({ field }) => (
        <FormItem className="flex items-start gap-4">
          <FormLabel className={contactFormLabelColClassName}>
            {label}
          </FormLabel>
          <div
            className={`min-w-0 flex-1 ${required && showValidationOnOptional ? "space-y-2" : ""}`}
          >
            <FormControl>
              <Input
                {...field}
                type={
                  name === "email" || name === "billing_email"
                    ? "email"
                    : "text"
                }
              />
            </FormControl>
            {required && showValidationOnOptional && <FormMessage />}
          </div>
        </FormItem>
      )}
    />
  );

  return (
    <>
      <section className="space-y-2">
        <h2 className="font-medium text-base">{t("sectionBasicInfo")}</h2>
        {isPerson ? (
          <ContactNameFields
            control={form.control}
            labelColClassName={contactFormLabelColClassName}
            onApplySplit={
              splitSourceLabel
                ? (parts) => {
                    for (const [key, value] of Object.entries(parts)) {
                      if (value !== undefined) {
                        form.setValue(
                          key as keyof ContactCreateFormValues,
                          value as string,
                          { shouldDirty: true }
                        );
                      }
                    }
                  }
                : undefined
            }
            splitSourceLabel={splitSourceLabel || undefined}
            t={t}
          />
        ) : null}
        <Card>
          <div className="space-y-3">
            {isPerson ? null : (
              <>
                {row("legal_name", t("legalName"), true)}
                {row("display_name", t("brandName"), false)}
              </>
            )}
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem className="flex items-start gap-4">
                  <FormLabel className={contactFormLabelColClassName}>
                    {t("kind")}
                  </FormLabel>
                  <div
                    className={`min-w-0 flex-1 ${showValidationOnOptional ? "space-y-2" : ""}`}
                  >
                    <Select
                      onValueChange={field.onChange}
                      value={
                        hasMultipleTypes
                          ? field.value
                          : (typeOptions[0]?.value ?? field.value)
                      }
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue>
                            {(() => {
                              const effectiveValue = hasMultipleTypes
                                ? field.value
                                : (typeOptions[0]?.value ?? field.value);
                              const opt = typeOptions.find(
                                (o) => o.value === effectiveValue
                              );
                              return opt?.label ?? effectiveValue;
                            })()}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {typeOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {showValidationOnOptional && <FormMessage />}
                  </div>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="roles"
              render={({ field }) => (
                <FormItem className="flex items-start gap-4">
                  <FormLabel className={contactFormLabelColClassName}>
                    {t("roles")}
                  </FormLabel>
                  <div className="min-w-0 flex-1">
                    <FormControl>
                      <MultiSelect
                        autoSize
                        defaultValue={field.value}
                        onValueChange={field.onChange}
                        options={roleSelectOptions}
                        placeholder={t("addRole")}
                        searchable={false}
                        showClear={false}
                        variant="ghost"
                      />
                    </FormControl>
                  </div>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem className="flex items-start gap-4">
                  <FormLabel className={contactFormLabelColClassName}>
                    {t("email")}
                  </FormLabel>
                  <div
                    className={`min-w-0 flex-1 ${showValidationOnOptional ? "space-y-2" : ""}`}
                  >
                    <FormControl>
                      <Input {...field} type="email" />
                    </FormControl>
                    {showValidationOnOptional && <FormMessage />}
                  </div>
                </FormItem>
              )}
            />
          </div>
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium text-base">{t("sectionBilling")}</h2>
        <Card>
          <div className="space-y-3">
            {row("contact_name", t("contactName"))}
            <FormField
              control={form.control}
              name="billing_email"
              render={({ field }) => (
                <FormItem className="flex items-start gap-4">
                  <FormLabel className={contactFormLabelColClassName}>
                    {t("billingEmail")}
                  </FormLabel>
                  <div
                    className={`min-w-0 flex-1 ${showValidationOnOptional ? "space-y-2" : ""}`}
                  >
                    <FormControl>
                      <Input {...field} type="email" />
                    </FormControl>
                    <FormDescription>{t("billingEmailHint")}</FormDescription>
                    {showValidationOnOptional && <FormMessage />}
                  </div>
                </FormItem>
              )}
            />
            {row("phone", t("phone"))}
            {row("reference_id", t("referenceId"))}
          </div>
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium text-base">{t("sectionAddress")}</h2>
        <Card>
          <div className="space-y-3">
            {row("address_street", t("street"))}
            {row("address_info", t("addressInfo"))}
            {row("address_zip", t("postalCode"))}
            {row("address_city", t("city"))}
            {row("address_country", t("country"))}
          </div>
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium text-base">
          {isPerson ? t("sectionTaxPerson") : t("sectionTaxLegal")}
        </h2>
        <Card>
          <div className="space-y-3">
            {row("vat_id", t("vatId"))}
            {row("tax_id", t("taxId"))}
            {!isPerson && (
              <>
                {row("registration_number", t("registrationNumber"))}
                {row("court_of_registration", t("courtOfRegistration"))}
                {row("legal_form", t("legalForm"))}
              </>
            )}
            {row("website_contact", t("websiteContact"))}
            {row("website_impress", t("websiteImpress"))}
          </div>
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium text-base">{t("notes")}</h2>
        <Card>
          <div className="space-y-3">{row("notes", t("notes"))}</div>
        </Card>
      </section>
    </>
  );
}
