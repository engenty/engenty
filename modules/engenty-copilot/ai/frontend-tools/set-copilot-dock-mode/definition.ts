import {
  buildFrontendToolDefinitionFromZod,
  defineFrontendToolSpec,
} from "@engenty/ag-ui-bridge";
import { z } from "zod";

export const SET_COPILOT_DOCK_MODE_SPEC = defineFrontendToolSpec({
  availability: "enabled",
  description:
    "Set the copilot panel position. `sidebar` = docked right as a resizable column; `window` = a draggable, resizable window over the page; `floating` = the compact one-line launcher; `bottom` = composer docked to the bottom; `mini-floating` = collapsed to the avatar.",
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
