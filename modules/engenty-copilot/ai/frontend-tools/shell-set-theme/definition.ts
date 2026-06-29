import {
  buildFrontendToolDefinitionFromZod,
  defineFrontendToolSpec,
} from "@engenty/ag-ui-bridge";
import { z } from "zod";

/**
 * Single source for the tool: the server catalog builds its definition from this spec,
 * and the browser handler (register.tsx) reuses the same schema for typed args.
 */
export const SHELL_SET_THEME_SPEC = defineFrontendToolSpec({
  availability: "enabled",
  description:
    "Switch the Engenty application color theme (light, dark, or system).",
  name: "shell_set_theme",
  safety: "safe",
  schema: z.object({ theme: z.enum(["light", "dark", "system"]) }),
  title: "Set theme",
});

export const SET_SHELL_THEME_TOOL =
  buildFrontendToolDefinitionFromZod(SHELL_SET_THEME_SPEC);
