import { useTranslation } from "@engenty/i18n/ui";
import { useMemo } from "react";
import type { OfferListItem } from "../api.js";
import { OfferDateField, type OfferDatePreset } from "./offer-date-field.js";
import { OfferNumberField } from "./offer-number-field.js";
import { OfferTextField } from "./offer-text-field.js";

interface OfferMetadataInlineProps {
  disabled?: boolean;
  offer: OfferListItem;
  onChange: (patch: Partial<OfferListItem>) => void;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getEndOfWeek(base: Date): Date {
  const result = new Date(base);
  const day = result.getDay();
  const daysUntilSunday = (7 - day) % 7;
  result.setDate(result.getDate() + daysUntilSunday);
  return result;
}

function getEndOfMonth(base: Date): Date {
  return new Date(base.getFullYear(), base.getMonth() + 1, 0);
}

export function OfferMetadataInline({
  offer,
  onChange,
  disabled = false,
}: OfferMetadataInlineProps) {
  const { t } = useTranslation("offers");
  const today = useMemo(() => new Date(), []);
  const offerDateBase = useMemo(() => {
    const raw = offer.offer_date;
    if (!raw) {
      return null;
    }
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [offer.offer_date]);

  const offerDatePresets = useMemo<OfferDatePreset[]>(
    () => [
      {
        id: "offer-date-today",
        label: t("datePresets.today"),
        resolveDate: () => today,
      },
      {
        id: "offer-date-tomorrow",
        label: t("datePresets.tomorrow"),
        resolveDate: () => addDays(today, 1),
      },
      {
        id: "offer-date-end-of-week",
        label: t("datePresets.endOfWeek"),
        resolveDate: () => getEndOfWeek(today),
      },
    ],
    [t, today]
  );

  const validUntilPresets = useMemo<OfferDatePreset[]>(
    () => [
      {
        id: "valid-until-end-of-week",
        label: t("datePresets.endOfWeek"),
        resolveDate: () => getEndOfWeek(today),
      },
      {
        id: "valid-until-end-of-month",
        label: t("datePresets.endOfMonth"),
        resolveDate: () => getEndOfMonth(today),
      },
      {
        id: "valid-until-plus-30",
        label: t("datePresets.plus30Days"),
        resolveDate: () => addDays(offerDateBase ?? today, 30),
      },
    ],
    [offerDateBase, t, today]
  );

  return (
    <div className="grid gap-x-8 gap-y-4 border-border border-t pt-6 md:grid-cols-4">
      <div className="space-y-1">
        <p className="mb-1 text-muted-foreground text-sm">{t("offerNumber")}</p>
        <OfferNumberField
          disabled={disabled}
          offerId={offer.id}
          onSave={(next) => onChange({ offer_number: next })}
          value={offer.offer_number}
        />
      </div>
      <div className="space-y-1">
        <p className="mb-1 text-muted-foreground text-sm">{t("offerDate")}</p>
        <OfferDateField
          disabled={disabled}
          onChange={(next) => onChange({ offer_date: next })}
          presets={offerDatePresets}
          value={offer.offer_date ?? null}
        />
      </div>
      <div className="space-y-1">
        <p className="mb-1 text-muted-foreground text-sm">{t("validUntil")}</p>
        <OfferDateField
          disabled={disabled}
          onChange={(next) => onChange({ valid_until: next })}
          presets={validUntilPresets}
          value={offer.valid_until ?? null}
        />
      </div>
      <div className="space-y-1">
        <p className="mb-1 text-muted-foreground text-sm">
          {t("yourReference")}
        </p>
        <OfferTextField
          description={t("editReferenceDescription")}
          disabled={disabled}
          onChange={(next) => onChange({ reference: next })}
          placeholder={t("referencePlaceholder")}
          title={t("editReference")}
          value={offer.reference}
        />
      </div>
    </div>
  );
}
