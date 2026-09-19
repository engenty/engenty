import {
  buildFrontendToolDefinitionFromZod,
  defineFrontendToolSpec,
} from "@engenty/ag-ui-bridge";
import { z } from "zod";

export const SET_COPILOT_DOCK_MODE_SPEC = defineFrontendToolSpec({
  availability: "enabled",
  description:
    "Set the copilot conversation chrome. `sidebar` = Work, a resizable side panel; `window` = Work detached as a draggable window; `drawer` = Work as a mobile sheet. Legacy `floating` and `bottom` remap to `sidebar`. `mini-floating` closes the panel (the blob stays on the app bar).",
  name: "setCopilotDockMode",
  schema: z.object({
    dock_mode: z.enum([
      "floating",
      "mini-floating",
      "window",
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
