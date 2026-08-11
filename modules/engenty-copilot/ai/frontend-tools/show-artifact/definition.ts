import {
  buildFrontendToolDefinitionFromZod,
  defineFrontendToolSpec,
} from "@engenty/ag-ui-bridge";
import { z } from "zod";

export const SHOW_ARTIFACT_SPEC = defineFrontendToolSpec({
  availability: "enabled",
  description:
    "Open the artifact panel and bring an artifact into view. Call after artifact_write to show the document you just wrote, or to re-open one the user closed. Pass the artifact_id returned by those tools.",
  name: "show_artifact",
  schema: z.object({
    artifact_id: z
      .string()
      .min(1)
      .describe("The id of the artifact to show (from artifact_write)."),
  }),
  title: "Show Artifact",
});

export const SHOW_ARTIFACT_TOOL =
  buildFrontendToolDefinitionFromZod(SHOW_ARTIFACT_SPEC);
