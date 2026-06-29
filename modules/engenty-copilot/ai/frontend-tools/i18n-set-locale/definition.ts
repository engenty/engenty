import {
  buildFrontendToolDefinitionFromZod,
  defineFrontendToolSpec,
} from "@engenty/ag-ui-bridge";
import { z } from "zod";

export const SET_LOCALE_SPEC = defineFrontendToolSpec({
  availability: "enabled",
  description: "Switch the Engenty interface language.",
  name: "i18n_set_locale",
  safety: "safe",
  schema: z.object({ locale: z.enum(["en", "de"]) }),
  title: "Set language",
});

export const SET_LOCALE_TOOL =
  buildFrontendToolDefinitionFromZod(SET_LOCALE_SPEC);
