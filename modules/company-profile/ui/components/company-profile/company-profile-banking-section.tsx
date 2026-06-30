import { useTranslation } from "@engenty/i18n/ui";
import { Card, FieldRow, FieldRowDivider } from "@engenty/ui-core";
import type { CompanyProfileSectionProps } from "./company-profile-form-types.js";

export function CompanyProfileBankingSection({
  settings,
  updateField,
}: CompanyProfileSectionProps) {
  const { t } = useTranslation("company-profile");

  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-semibold text-base">{t("sections.bankInfo")}</h3>
        <p className="text-muted-foreground text-sm">
          {t("sections.bankInfoDesc")}
        </p>
      </div>
      <Card variant="form">
        <FieldRow
          desc={t("sections.bankNameDesc")}
          id="bank-name"
          label={t("sections.bankName")}
          onChange={(value) => updateField("bank_name", value)}
          value={settings.bank_name ?? ""}
        />
        <FieldRowDivider />
        <FieldRow
          desc={t("sections.bankIbanDesc")}
          id="bank-iban"
          label={t("sections.bankIban")}
          onChange={(value) => updateField("bank_iban", value)}
          value={settings.bank_iban ?? ""}
        />
        <FieldRowDivider />
        <FieldRow
          desc={t("sections.bankBicDesc")}
          id="bank-bic"
          label={t("sections.bankBic")}
          onChange={(value) => updateField("bank_bic", value)}
          value={settings.bank_bic ?? ""}
        />
        <FieldRowDivider />
        <FieldRow
          desc={t("sections.bankAccountNameDesc")}
          id="bank-account-name"
          label={t("sections.bankAccountName")}
          onChange={(value) => updateField("bank_account_name", value)}
          value={settings.bank_account_name ?? ""}
        />
      </Card>
    </section>
  );
}
