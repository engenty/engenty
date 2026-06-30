import { useTranslation } from "@engenty/i18n/ui";
import {
  Card,
  FieldRow,
  FieldRowDivider,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { EMPTY_SELECT_VALUE } from "../../lib/company-profile-form.js";
import { COUNTRIES, getCountryName } from "../../lib/countries.js";
import type { CompanyProfileSectionProps } from "./company-profile-form-types.js";

export function CompanyProfileAddressSection({
  settings,
  updateField,
}: CompanyProfileSectionProps) {
  const { t, i18n } = useTranslation("company-profile");
  const locale = i18n.language?.startsWith("de") ? "de" : "en";

  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-semibold text-base">{t("sections.address")}</h3>
        <p className="text-muted-foreground text-sm">
          {t("sections.addressDesc")}
        </p>
      </div>
      <Card variant="form">
        <FieldRow
          desc={t("sections.streetDesc")}
          id="address-street"
          label={t("sections.street")}
          onChange={(value) => updateField("address_street", value)}
          value={settings.address_street ?? ""}
        />
        <FieldRowDivider />
        <FieldRow
          desc={t("sections.street2Desc")}
          id="address-street-2"
          label={t("sections.street2")}
          onChange={(value) => updateField("address_street_2", value)}
          value={settings.address_street_2 ?? ""}
        />
        <FieldRowDivider />
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <Label className="font-semibold text-base" htmlFor="address-zip">
              {t("sections.zipCity")}
            </Label>
            <p className="text-muted-foreground text-sm">
              {t("sections.zipCityDesc")}
            </p>
          </div>
          <div className="flex max-w-[320px] flex-1 gap-2">
            <Input
              className="w-24 shrink-0"
              id="address-zip"
              onChange={(event) =>
                updateField("address_zip", event.target.value)
              }
              placeholder={t("sections.zip")}
              value={settings.address_zip ?? ""}
            />
            <Input
              className="min-w-0 flex-1"
              id="address-city"
              onChange={(event) =>
                updateField("address_city", event.target.value)
              }
              placeholder={t("sections.city")}
              value={settings.address_city ?? ""}
            />
          </div>
        </div>
        <FieldRowDivider />
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <Label
              className="font-semibold text-base"
              htmlFor="address-country"
            >
              {t("sections.country")}
            </Label>
            <p className="text-muted-foreground text-sm">
              {t("sections.countryDesc")}
            </p>
          </div>
          <Select
            onValueChange={(value) =>
              updateField(
                "address_country",
                value === EMPTY_SELECT_VALUE ? null : value
              )
            }
            value={
              settings.address_country &&
              COUNTRIES.some(
                (country) => country.code === settings.address_country
              )
                ? settings.address_country
                : EMPTY_SELECT_VALUE
            }
          >
            <SelectTrigger className="max-w-[320px]" id="address-country">
              <SelectValue placeholder={t("sections.country")}>
                {settings.address_country &&
                settings.address_country !== EMPTY_SELECT_VALUE
                  ? getCountryName(settings.address_country, locale)
                  : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={EMPTY_SELECT_VALUE}>-</SelectItem>
              {COUNTRIES.map((country) => (
                <SelectItem key={country.code} value={country.code}>
                  {getCountryName(country.code, locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>
    </section>
  );
}
