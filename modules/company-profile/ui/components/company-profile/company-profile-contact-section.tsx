import { useTranslation } from "@engenty/i18n/ui";
import { Card, FieldRow, FieldRowDivider } from "@engenty/ui-core";
import type { CompanyProfileSectionProps } from "./company-profile-form-types.js";

export function CompanyProfileContactSection({
  settings,
  updateField,
}: CompanyProfileSectionProps) {
  const { t } = useTranslation("company-profile");

  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-semibold text-base">{t("sections.contactInfo")}</h3>
        <p className="text-muted-foreground text-sm">
          {t("sections.contactInfoDesc")}
        </p>
      </div>
      <Card variant="form">
        <FieldRow
          desc={t("sections.phone")}
          id="phone"
          label={t("sections.phone")}
          onChange={(value) => updateField("phone", value)}
          value={settings.phone ?? ""}
        />
        <FieldRowDivider />
        <FieldRow
          desc={t("sections.email")}
          id="email"
          label={t("sections.email")}
          onChange={(value) => updateField("email", value)}
          type="email"
          value={settings.email ?? ""}
        />
        <FieldRowDivider />
        <FieldRow
          desc={t("sections.website")}
          id="website"
          label={t("sections.website")}
          onChange={(value) => updateField("website", value)}
          value={settings.website ?? ""}
        />
        <FieldRowDivider />
        <FieldRow
          desc={t("sections.imprintUrl")}
          id="imprint-url"
          label={t("sections.imprintUrl")}
          onChange={(value) => updateField("imprint_url", value)}
          value={settings.imprint_url ?? ""}
        />
      </Card>
    </section>
  );
}
