import { useTranslation } from "@engenty/i18n/ui";
import {
  Card,
  FieldRow,
  FieldRowDivider,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import type { CompanyType } from "../../api.js";
import {
  COMPANY_TYPE_OPTIONS,
  EMPTY_SELECT_VALUE,
} from "../../lib/company-profile-form.js";
import type { CompanyProfileSectionProps } from "./company-profile-form-types.js";

export function CompanyProfileCompanySection({
  settings,
  updateField,
}: CompanyProfileSectionProps) {
  const { t } = useTranslation("company-profile");

  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-semibold text-base">{t("sections.companyInfo")}</h3>
        <p className="text-muted-foreground text-sm">
          {t("sections.companyInfoDesc")}
        </p>
      </div>
      <Card variant="form">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <Label className="font-semibold text-base" htmlFor="company-type">
              {t("sections.companyType")}
            </Label>
            <p className="text-muted-foreground text-sm">
              {t("sections.companyTypeDesc")}
            </p>
          </div>
          <Select
            onValueChange={(value) =>
              updateField(
                "company_type",
                value === EMPTY_SELECT_VALUE ? null : (value as CompanyType)
              )
            }
            value={settings.company_type ?? EMPTY_SELECT_VALUE}
          >
            <SelectTrigger className="max-w-[320px]" id="company-type">
              <SelectValue placeholder={t("sections.companyType")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={EMPTY_SELECT_VALUE}>-</SelectItem>
              {COMPANY_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <FieldRowDivider />
        <FieldRow
          desc={t("sections.companyDesc")}
          id="company-name"
          label={t("sections.company")}
          onChange={(value) => updateField("name", value)}
          value={settings.name ?? ""}
        />
      </Card>
    </section>
  );
}
