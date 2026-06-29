import {
  buildFrontendToolDefinitionFromZod,
  defineFrontendToolSpec,
} from "@engenty/ag-ui-bridge";
import { z } from "zod";

export const OFFER_FILE_DOWNLOADS_SPEC = defineFrontendToolSpec({
  availability: "enabled",
  description:
    "Offer one or more generated files for download in the chat UI. Use after writing files to the agent workspace (tenant storage keys, often under ai/workspace/). Prefer this over pasting raw signed URLs.",
  name: "offer_file_downloads",
  safety: "safe",
  schema: z.object({
    files: z
      .array(
        z.object({
          key: z
            .string()
            .describe(
              "Tenant file storage object key (for example tenants/<tenant-id>/ai/workspace/report.csv)."
            ),
          mime_type: z
            .string()
            .describe("Optional MIME type for icon hints.")
            .optional(),
          name: z
            .string()
            .describe("Display filename shown in the download widget.")
            .optional(),
        })
      )
      .min(1),
  }),
  title: "Offer File Downloads",
});

export const OFFER_FILE_DOWNLOADS_TOOL = buildFrontendToolDefinitionFromZod(
  OFFER_FILE_DOWNLOADS_SPEC
);
