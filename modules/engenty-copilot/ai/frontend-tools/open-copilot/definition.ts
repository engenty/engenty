import {
  buildFrontendToolDefinitionFromZod,
  defineFrontendToolSpec,
} from "@engenty/ag-ui-bridge";
import { z } from "zod";

export const OPEN_COPILOT_SPEC = defineFrontendToolSpec({
  availability: "enabled",
  description: "Open the Engenty copilot panel.",
  name: "openCopilot",
  safety: "safe",
  schema: z.object({}),
  title: "Open Copilot",
});

export const OPEN_COPILOT_TOOL =
  buildFrontendToolDefinitionFromZod(OPEN_COPILOT_SPEC);
