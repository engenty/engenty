import type { useTranslation } from "@engenty/i18n/ui";
import type { CsvTableLabels, XlsxViewerLabels } from "@engenty/import";

/** The `t` this pane already has, without importing i18next's own types. */
export type Translate = ReturnType<typeof useTranslation>["t"];

/** The grid's copy, from the app's namespace so it translates with everything else. */
export function csvTableLabels(t: Translate): CsvTableLabels {
  return {
    columns: t("spaces.data.csv.columns", { defaultValue: "columns" }),
    empty: t("spaces.data.csv.empty", {
      defaultValue: "This file has no rows.",
    }),
    ragged: t("spaces.data.csv.ragged", {
      defaultValue:
        "{{count}} rows had more cells than the header — kept as unnamed columns.",
    }),
    rows: t("spaces.data.csv.rows", { defaultValue: "rows" }),
    selected: t("spaces.data.csv.selected", {
      defaultValue: "{{count}} selected",
    }),
    showAll: t("spaces.data.csv.showAll", {
      defaultValue: "Show all {{count}} rows",
    }),
  };
}

/** The workbook viewer's copy, from the same namespace as the grid's. */
export function xlsxViewerLabels(t: Translate): XlsxViewerLabels {
  return {
    failed: t("spaces.data.xlsx.failed", {
      defaultValue: "This workbook could not be read.",
    }),
    hiddenSheet: t("spaces.data.xlsx.hiddenSheet", { defaultValue: "hidden" }),
    noSheets: t("spaces.data.xlsx.noSheets", {
      defaultValue: "This workbook has no sheets.",
    }),
    reading: t("spaces.data.xlsx.reading", {
      defaultValue: "Reading workbook…",
    }),
    truncatedColumns: t("spaces.data.xlsx.truncatedColumns", {
      defaultValue: "Showing the first {{shown}} of {{total}} columns.",
    }),
    truncatedRows: t("spaces.data.xlsx.truncatedRows", {
      defaultValue: "Showing the first {{shown}} of {{total}} rows.",
    }),
  };
}
