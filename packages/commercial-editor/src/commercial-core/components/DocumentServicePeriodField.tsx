import { useTranslation } from "@engenty/i18n/ui";
import { format, parse } from "date-fns";
import { DocumentTextField } from "./DocumentTextField";

interface DocumentServicePeriodFieldProps {
  disabled?: boolean;
  from: string | null;
  onChange: (from: string | null, until: string | null) => void;
  until: string | null;
}

/**
 * Parses "DD.MM.YYYY – DD.MM.YYYY" or "DD.MM.YYYY - DD.MM.YYYY" into from/until.
 * Returns [from, until] or [wholeString, null] if not parseable.
 */
function parseServicePeriod(text: string): [string | null, string | null] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [null, null];
  }

  const separators = ["–", "-", "—"];
  for (const sep of separators) {
    const parts = trimmed.split(sep);
    if (parts.length === 2) {
      const fromStr = parts[0].trim();
      const untilStr = parts[1].trim();
      try {
        const fromDate = parse(fromStr, "dd.MM.yyyy", new Date());
        const untilDate = parse(untilStr, "dd.MM.yyyy", new Date());
        if (
          !(
            Number.isNaN(fromDate.getTime()) ||
            Number.isNaN(untilDate.getTime())
          )
        ) {
          return [
            fromDate.toISOString().split("T")[0],
            untilDate.toISOString().split("T")[0],
          ];
        }
      } catch {
        // continue
      }
    }
  }

  // Single date?
  try {
    const d = parse(trimmed, "dd.MM.yyyy", new Date());
    if (!Number.isNaN(d.getTime())) {
      const iso = d.toISOString().split("T")[0];
      return [iso ?? null, null];
    }
  } catch {
    // fall through
  }

  // Free text: store in from only
  return [trimmed, null];
}

function buildDisplayValue(from: string | null, until: string | null): string {
  if (!(from || until)) {
    return "";
  }
  if (from && until) {
    try {
      const fromDate = new Date(from);
      const untilDate = new Date(until);
      if (
        !(Number.isNaN(fromDate.getTime()) || Number.isNaN(untilDate.getTime()))
      ) {
        return `${format(fromDate, "dd.MM.yyyy")} – ${format(untilDate, "dd.MM.yyyy")}`;
      }
    } catch {
      // fall through
    }
  }
  if (from) {
    try {
      const d = new Date(from);
      if (!Number.isNaN(d.getTime())) {
        return format(d, "dd.MM.yyyy");
      }
    } catch {
      // fall through
    }
    return from;
  }
  if (until) {
    try {
      const d = new Date(until);
      if (!Number.isNaN(d.getTime())) {
        return format(d, "dd.MM.yyyy");
      }
    } catch {
      // fall through
    }
    return until;
  }
  return "";
}

/**
 * One text field for service period. Displays combined from–until.
 * On save, parses "DD.MM.YYYY – DD.MM.YYYY" and splits into from/until.
 */
export function DocumentServicePeriodField({
  from,
  until,
  onChange,
  disabled,
}: DocumentServicePeriodFieldProps) {
  const { t } = useTranslation("offers");
  const displayValue = buildDisplayValue(from, until);

  const handleChange = (value: string | null) => {
    if (!value) {
      onChange(null, null);
      return;
    }
    const [parsedFrom, parsedUntil] = parseServicePeriod(value);
    onChange(parsedFrom, parsedUntil);
  };

  return (
    <DocumentTextField
      descriptionKey="invoices.settings.editServicePeriodDescription"
      disabled={disabled}
      onChange={handleChange}
      placeholder={t("invoices.settings.servicePeriodPlaceholder")}
      titleKey="invoices.settings.editServicePeriod"
      value={displayValue || null}
    />
  );
}
