import { useTranslation } from "@engenty/i18n/ui";
import { Card, FieldRow, FieldRowDivider } from "@engenty/ui-core";
import type { CompanyProfileSectionProps } from "./company-profile-form-types.js";

export function CompanyProfileLegalSection({
  settings,
  updateField,
}: CompanyProfileSectionProps) {
  const { t } = useTranslation("company-profile");

  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-semibold text-base">{t("sections.legalInfo")}</h3>
        <p className="text-muted-foreground text-sm">
          {t("sections.legalInfoDesc")}
        </p>
      </div>
      <Card variant="form">
        <FieldRow
          desc={t("sections.ownerDesc")}
          id="owner"
          label={t("sections.owner")}
          onChange={(value) => updateField("owner", value)}
          value={settings.owner ?? ""}
        />
        <FieldRowDivider />
        <FieldRow
          desc={t("sections.managingDirectorDesc")}
          id="managing-director"
          label={t("sections.managingDirector")}
          onChange={(value) => updateField("managing_director", value)}
          value={settings.managing_director ?? ""}
        />
        <FieldRowDivider />
        <FieldRow
          desc={t("sections.companyRegistrationNumberDesc")}
          id="company-registration"
          label={t("sections.companyRegistrationNumber")}
          onChange={(value) =>
            updateField("company_registration_number", value)
          }
          value={settings.company_registration_number ?? ""}
        />
        <FieldRowDivider />
        <FieldRow
          desc={t("sections.taxNumber")}
          id="tax-number"
          label={t("sections.taxNumber")}
          onChange={(value) => updateField("tax_number", value)}
          value={settings.tax_number ?? ""}
        />
        <FieldRowDivider />
        <FieldRow
          desc={t("sections.vatId")}
          id="vat-id"
          label={t("sections.vatId")}
          onChange={(value) => updateField("vat_id", value)}
          value={settings.vat_id ?? ""}
        />
      </Card>
    </section>
  );
}
