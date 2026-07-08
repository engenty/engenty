import {
  buildFrontendToolDefinitionFromZod,
  defineFrontendToolSpec,
} from "@engenty/ag-ui-bridge";
import { z } from "zod";

export const FOCUS_FIELD_SPEC = defineFrontendToolSpec({
  availability: "enabled",
  description: "Focus a named field registered by the current page.",
  name: "focusField",
  schema: z.object({ field_id: z.string() }),
  title: "Focus Field",
});

export const FOCUS_FIELD_TOOL =
  buildFrontendToolDefinitionFromZod(FOCUS_FIELD_SPEC);
