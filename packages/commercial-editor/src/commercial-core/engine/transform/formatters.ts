import { format } from "date-fns";
import { getCurrencyCode } from "@/config/localization";
import { DEFAULT_LOCALE } from "../../types";
import { formatPhaseIndex } from "../../utils/formatPhaseIndex";

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) {
    return format(new Date(), "dd.MM.yyyy");
  }
  try {
    return format(new Date(dateStr), "dd.MM.yyyy");
  } catch {
    return format(new Date(), "dd.MM.yyyy");
  }
}

export function formatOptionalDate(
  dateStr: string | null | undefined
): string | null {
  if (!dateStr) {
    return null;
  }
  try {
    return format(new Date(dateStr), "dd.MM.yyyy");
  } catch {
    return null;
  }
}

const FALLBACK_LOCALE = DEFAULT_LOCALE;

export function formatNumber(
  value: number,
  locale: string,
  showCents = false
): string {
  const hasCents = Math.round(value * 100) % 100 !== 0;
  const minimumFractionDigits = hasCents || showCents ? 2 : 0;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(value);
}

export function formatCurrency(
  value: number,
  locale: string,
  showCents = false
): string {
  const hasCents = Math.round(value * 100) % 100 !== 0;
  const minimumFractionDigits = hasCents || showCents ? 2 : 0;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits,
    maximumFractionDigits: 2,
    useGrouping: true,
    style: "currency",
    currency: "EUR",
  }).format(value);
}

export function createFormatter(
  locale = DEFAULT_LOCALE,
  currencyCode?: string,
  showCents = false
) {
  const minimumFractionDigits = showCents ? 2 : 0;
  const currency = currencyCode || getCurrencyCode(locale);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits,
    maximumFractionDigits: 2,
  });
}

/**
 * Simple currency formatter for list/card displays.
 * Uses de-DE and EUR by default; pass locale/currency for customization.
 */
export function formatCurrencyDisplay(
  value: number | null,
  locale = "de-DE",
  currency = "EUR"
): string {
  if (value == null) {
    return "€ 0";
  }
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `€ ${value.toLocaleString("de-DE")}`;
  }
}

export function formatCurrencyPrice(
  value: number,
  locale: string,
  currency: string
): string {
  const hasCents = Math.round(value * 100) % 100 !== 0;
  try {
    const nf = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: 2,
    });
    return nf.format(value);
  } catch {
    const nf = new Intl.NumberFormat(FALLBACK_LOCALE, {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: 2,
    });
    return nf.format(value);
  }
}

export function generatePhasePrefix(
  index: number,
  showPhaseIndex: boolean,
  phaseIndexPattern: string
): string {
  if (!showPhaseIndex) {
    return "";
  }
  return `${formatPhaseIndex(phaseIndexPattern, index + 1)} `;
}
