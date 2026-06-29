import { de as dateFnsDe, enUS as dateFnsEnUS } from "date-fns/locale";
import type { DayPickerLocale } from "react-day-picker";
import {
  de as dayPickerDe,
  enUS as dayPickerEnUS,
} from "react-day-picker/locale";

/** Maps UI language codes to date-fns / DayPicker locales (Monday-first for German). */
export function resolveDayPickerLocale(
  language: string | undefined
): DayPickerLocale {
  return language?.toLowerCase().startsWith("de") ? dayPickerDe : dayPickerEnUS;
}

export function resolveDateFnsLocale(language: string | undefined) {
  return language?.toLowerCase().startsWith("de") ? dateFnsDe : dateFnsEnUS;
}
