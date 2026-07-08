import {
  buildFrontendToolDefinitionFromZod,
  defineFrontendToolSpec,
} from "@engenty/ag-ui-bridge";
import { z } from "zod";

export const OPEN_DIALOG_SPEC = defineFrontendToolSpec({
  availability: "enabled",
  description: "Open a named dialog registered by the current page.",
  name: "openDialog",
  schema: z.object({
    dialog_id: z.string(),
    payload: z.record(z.string(), z.unknown()).optional(),
  }),
  title: "Open Dialog",
});

export const OPEN_DIALOG_TOOL =
  buildFrontendToolDefinitionFromZod(OPEN_DIALOG_SPEC);
