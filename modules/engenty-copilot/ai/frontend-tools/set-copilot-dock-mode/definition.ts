import {
  buildFrontendToolDefinitionFromZod,
  defineFrontendToolSpec,
} from "@engenty/ag-ui-bridge";
import { z } from "zod";

export const SET_COPILOT_DOCK_MODE_SPEC = defineFrontendToolSpec({
  availability: "enabled",
  description: "Set the copilot panel position.",
  name: "setCopilotDockMode",
  safety: "safe",
  schema: z.object({
    dock_mode: z.enum([
      "floating",
      "mini-floating",
      "drawer",
      "sidebar",
      "bottom",
    ]),
  }),
  title: "Set Copilot Dock Mode",
});

export const SET_COPILOT_DOCK_MODE_TOOL = buildFrontendToolDefinitionFromZod(
  SET_COPILOT_DOCK_MODE_SPEC
);
