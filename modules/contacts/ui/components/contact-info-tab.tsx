import { useTranslation } from "@engenty/i18n/ui";
import { Card, MultiSelect } from "@engenty/ui-core";
import { useCallback, useMemo } from "react";
import { FIXED_CONTACT_ROLES } from "../api/role-menu-settings.js";
import type { ContactListItem } from "../api.js";
import { useContactsRoleOptions } from "../hooks/use-contacts-role-options.js";
import {
  useAddContactRoleMutation,
  useContactDetailQuery,
  useRemoveContactRoleMutation,
} from "../queries.js";
import { ContactAffiliationsCard } from "./contact-affiliations-card.js";

/** Read-only KV blocks: hairline dividers, horizontal inset only (no stacked outer + row vertical padding). */
const contactDetailKvListClassName = "divide-y divide-border/50 px-5 sm:px-6";

/** ~⅓ label / ~⅔ value; stacks on narrow viewports. */
const contactDetailKvRowClassName =
  "flex flex-col gap-1.5 py-3 sm:grid sm:grid-cols-[minmax(10rem,38%)_minmax(0,1fr)] sm:items-start sm:gap-x-8 sm:gap-y-0";

const contactDetailKvLabelClassName =
  "text-muted-foreground text-sm font-normal leading-snug sm:pt-px";

const contactDetailKvValueClassName =
  "min-w-0 text-foreground text-sm font-normal leading-snug break-words";

/** Same display stack as the `DetailPageHeader` title (`font-heading`); section scale under the page `h1`. */
const contactDetailSectionHeadingClassName =
  "font-heading font-semibold text-lg tracking-tight text-foreground leading-7";

interface ContactInfoTabProps {
  entity: ContactListItem;
}

export function ContactInfoTab({ entity }: ContactInfoTabProps) {
  const { t } = useTranslation("contacts");
  const addRoleMutation = useAddContactRoleMutation(entity.id);
  const removeRoleMutation = useRemoveContactRoleMutation(entity.id);
  const detailQuery = useContactDetailQuery(entity.id);
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

  const handleRolesChange = useCallback(
    async (newValues: string[]) => {
      const current = entity.roles ?? [];
      const toAdd = newValues.filter((v) => !current.includes(v));
      const toRemove = current.filter((v) => !newValues.includes(v));
      try {
        for (const role of toRemove) {
          await removeRoleMutation.mutateAsync(role);
        }
        for (const role of toAdd) {
          await addRoleMutation.mutateAsync(role);
        }
      } catch {
        await detailQuery.refetch();
      }
    },
    [entity.roles, removeRoleMutation, addRoleMutation, detailQuery]
  );

  const read = (value: string | null | undefined) =>
    value && value.trim().length > 0 ? value : "-";
  const isOrg = entity.type === "organisation";

  const importRows = [
    ...(entity.import_id
      ? [{ label: t("importId"), value: read(entity.import_id) }]
      : []),
    ...(entity.last_imported_at
      ? [
          {
            label: t("lastImported"),
            value: new Date(entity.last_imported_at).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            }),
          },
        ]
      : []),
  ];
  const basicHeading =
    !isOrg && entity.display_name
      ? `${t("nameSection")}: ${entity.display_name}`
      : t("sectionBasicInfo");

  const basicRows = [
    ...(isOrg
      ? [
          {
            label: t("legalName"),
            value: read(entity.legal_name || entity.display_name),
          },
          { label: t("kind"), value: t("organisation") },
          { label: t("brandName"), value: read(entity.display_name) },
        ]
      : [
          { label: t("displayName"), value: read(entity.display_name) },
          { label: t("namePrefix"), value: read(entity.name_prefix) },
          { label: t("firstName"), value: read(entity.first_name) },
          { label: t("middleName"), value: read(entity.middle_name) },
          { label: t("lastName"), value: read(entity.last_name) },
          { label: t("nameSuffix"), value: read(entity.name_suffix) },
          { label: t("phoneticName"), value: read(entity.phonetic_name) },
          { label: t("birthName"), value: read(entity.birth_name) },
          ...(entity.display_name_override?.trim()
            ? [
                {
                  label: t("displayNameOverride"),
                  value: read(entity.display_name_override),
                },
              ]
            : []),
          { label: t("kind"), value: t("person") },
        ]),
    { label: t("email"), value: read(entity.email) },
    ...importRows,
  ];
  const emailTrim = (entity.email ?? "").trim();
  const billingEmailTrim = (entity.billing_email ?? "").trim();
  const billingRows = [
    { label: t("contactName"), value: read(entity.contact_name) },
    ...(billingEmailTrim && billingEmailTrim !== emailTrim
      ? [{ label: t("billingEmail"), value: read(entity.billing_email) }]
      : []),
    { label: t("phone"), value: read(entity.phone) },
    { label: t("referenceId"), value: read(entity.reference_id) },
  ];
  const addressRows = [
    { label: t("street"), value: read(entity.address_street) },
    { label: t("addressInfo"), value: read(entity.address_info) },
    { label: t("postalCode"), value: read(entity.address_zip) },
    { label: t("city"), value: read(entity.address_city) },
    { label: t("country"), value: read(entity.address_country) },
  ];
  const taxRows = isOrg
    ? [
        { label: t("vatId"), value: read(entity.vat_id) },
        { label: t("taxId"), value: read(entity.tax_id) },
        {
          label: t("registrationNumber"),
          value: read(entity.registration_number),
        },
        {
          label: t("courtOfRegistration"),
          value: read(entity.court_of_registration),
        },
        { label: t("legalForm"), value: read(entity.legal_form) },
        { label: t("websiteContact"), value: read(entity.website_contact) },
        { label: t("websiteImpress"), value: read(entity.website_impress) },
      ]
    : [
        { label: t("vatId"), value: read(entity.vat_id) },
        { label: t("taxId"), value: read(entity.tax_id) },
        { label: t("websiteContact"), value: read(entity.website_contact) },
        { label: t("websiteImpress"), value: read(entity.website_impress) },
      ];

  const renderSection = (
    heading: string,
    rows: Array<{ label: string; value: string }>
  ) => (
    <section className="space-y-1.5" key={heading}>
      <h2 className={contactDetailSectionHeadingClassName}>{heading}</h2>
      <Card className="rounded-xl px-0 py-2 sm:px-0 sm:py-2">
        <div className={contactDetailKvListClassName}>
          {rows.map((row) => (
            <div className={contactDetailKvRowClassName} key={row.label}>
              <p className={contactDetailKvLabelClassName}>{row.label}</p>
              <p className={contactDetailKvValueClassName}>{row.value}</p>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );

  return (
    <>
      <section className="space-y-1.5">
        <h2 className={contactDetailSectionHeadingClassName}>{basicHeading}</h2>
        <Card className="rounded-xl px-0 py-2 sm:px-0 sm:py-2">
          <div className={contactDetailKvListClassName}>
            {basicRows.map((row) => (
              <div className={contactDetailKvRowClassName} key={row.label}>
                <p className={contactDetailKvLabelClassName}>{row.label}</p>
                <p className={contactDetailKvValueClassName}>{row.value}</p>
              </div>
            ))}
            <div className={contactDetailKvRowClassName}>
              <p className={contactDetailKvLabelClassName}>{t("roles")}</p>
              <div className="min-w-0">
                <MultiSelect
                  autoSize
                  defaultValue={entity.roles ?? []}
                  onValueChange={(values) => void handleRolesChange(values)}
                  options={roleSelectOptions}
                  placeholder={t("addRole")}
                  searchable={false}
                  showClear={false}
                  variant="ghost"
                />
              </div>
            </div>
          </div>
        </Card>
      </section>
      {renderSection(t("sectionBilling"), billingRows)}
      {renderSection(t("sectionAddress"), addressRows)}
      {renderSection(
        isOrg ? t("sectionTaxLegal") : t("sectionTaxPerson"),
        taxRows
      )}
      {isOrg ? null : <ContactAffiliationsCard entity={entity} />}
      {renderSection(t("notes"), [
        { label: t("notes"), value: read(entity.notes) },
      ])}
    </>
  );
}
