"use client";

import { useTranslation } from "@engenty/i18n/ui";
import { useMemo } from "react";
import type { DayPickerLocale } from "react-day-picker";
import {
  resolveDateFnsLocale,
  resolveDayPickerLocale,
} from "../lib/date-locale.js";

/** Active DayPicker locale from i18n unless a caller passes an explicit override. */
export function useDateLocale(localeOverride?: Partial<DayPickerLocale>) {
  const { i18n } = useTranslation();
  const language = i18n.language;

  return useMemo(() => {
    const dayPickerLocale =
      localeOverride?.code == null
        ? resolveDayPickerLocale(language)
        : (localeOverride as DayPickerLocale);

    return {
      dateFnsLocale: localeOverride?.code
        ? (localeOverride as DayPickerLocale)
        : resolveDateFnsLocale(language),
      dayPickerLocale,
    };
  }, [language, localeOverride]);
}
