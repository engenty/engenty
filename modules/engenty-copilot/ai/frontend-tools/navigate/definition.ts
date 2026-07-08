import {
  buildFrontendToolDefinitionFromZod,
  defineFrontendToolSpec,
} from "@engenty/ag-ui-bridge";
import { z } from "zod";

export const NAVIGATE_SPEC = defineFrontendToolSpec({
  availability: "enabled",
  description:
    "Navigate to an internal Engenty application path and keep the copilot open beside the user in the current dock mode.",
  name: "navigate",
  schema: z.object({ to: z.string(), replace: z.boolean().optional() }),
  title: "Navigate",
});

export const NAVIGATE_TOOL = buildFrontendToolDefinitionFromZod(NAVIGATE_SPEC);
