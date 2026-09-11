/**
 * An `.xlsx` workbook in the pane.
 *
 * Read-only, and not because reading was the easy half: writing a workbook back
 * means preserving styles, formulas and number formats this viewer does not
 * model, and a save that dropped them silently would be worse than no save.
 */
import { useRegisterAgentUiSlice } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  serializeCsvMatrix,
  XlsxViewer,
  type XlsxWorkbook,
} from "@engenty/import";
import { useQuery } from "@engenty/query-client";
import { Spinner } from "@engenty/ui-core";
import { useMemo, useState } from "react";
import { fetchFileSpaceBytes } from "@/lib/api/space-drive-client";
import { buildSpaceDataFileTextSlice } from "@/lib/space-data-agent-context";
import { csvTableLabels, xlsxViewerLabels } from "./labels";
import { SPACE_DATA_FILE_TEXT_SLICE_ID } from "./surfaces";

/**
 * How much workbook the pane will pull down before offering Download instead.
 *
 * Larger than the text budget because an `.xlsx` is a zip: a hundred thousand
 * cells compress to a couple of megabytes, and refusing those would refuse most
 * real spreadsheets.
 */
const SPREADSHEET_PREVIEW_MAX_BYTES = 8 * 1024 * 1024;

/** The workbook's sheets as text the copilot can read. */
function workbookAsText(workbook: XlsxWorkbook): string {
  return workbook.sheets
    .map((sheet) =>
      `# ${sheet.name}\n${serializeCsvMatrix(sheet.matrix)}`.trim()
    )
    .join("\n\n");
}

export function SpreadsheetFilePreview({
  name,
  sizeBytes,
  url,
}: {
  name: string;
  sizeBytes: number | null;
  url: string;
}) {
  const { t } = useTranslation("common");
  const [workbook, setWorkbook] = useState<XlsxWorkbook | null>(null);
  const oversized =
    typeof sizeBytes === "number" && sizeBytes > SPREADSHEET_PREVIEW_MAX_BYTES;
  const bytesQuery = useQuery({
    // Signed storage URLs need no session. Same-origin `/download` proxies do.
    enabled: !oversized,
    queryFn: async ({ signal }) => {
      const blob = await fetchFileSpaceBytes(url, signal);
      return blob.arrayBuffer();
    },
    queryKey: ["space-drive", "file-workbook", url],
    staleTime: 60_000,
  });

  // What the reader is looking at, so the copilot can answer a question about
  // this workbook without a round trip through storage.
  useRegisterAgentUiSlice(
    SPACE_DATA_FILE_TEXT_SLICE_ID,
    useMemo(
      () =>
        workbook
          ? buildSpaceDataFileTextSlice({
              mimeType: "text/csv",
              name,
              text: workbookAsText(workbook),
            })
          : null,
      [name, workbook]
    )
  );

  if (oversized) {
    return (
      <p className="p-6 text-muted-foreground text-sm">
        {t("spaces.data.tooLargeToPreview", {
          defaultValue: "Too large to preview here — download it to open it.",
        })}
      </p>
    );
  }
  if (bytesQuery.isPending) {
    return (
      <div className="flex items-center gap-2 p-6 text-muted-foreground text-sm">
        <Spinner className="size-4" />
        {t("spaces.data.loading")}
      </div>
    );
  }
  if (bytesQuery.error || !bytesQuery.data) {
    return (
      <p className="p-6 text-destructive text-sm">
        {t("spaces.data.readFailed", {
          defaultValue: "This node could not be read.",
        })}
      </p>
    );
  }
  return (
    <XlsxViewer
      className="rounded-none border-0"
      data={bytesQuery.data}
      gridLabels={csvTableLabels(t)}
      labels={xlsxViewerLabels(t)}
      onWorkbook={setWorkbook}
    />
  );
}
