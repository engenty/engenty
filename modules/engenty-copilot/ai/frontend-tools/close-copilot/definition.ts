import {
  buildFrontendToolDefinitionFromZod,
  defineFrontendToolSpec,
} from "@engenty/ag-ui-bridge";
import { z } from "zod";

export const CLOSE_COPILOT_SPEC = defineFrontendToolSpec({
  availability: "enabled",
  description: "Close the Engenty copilot panel.",
  name: "closeCopilot",
  safety: "safe",
  schema: z.object({}),
  title: "Close Copilot",
});

export const CLOSE_COPILOT_TOOL =
  buildFrontendToolDefinitionFromZod(CLOSE_COPILOT_SPEC);
