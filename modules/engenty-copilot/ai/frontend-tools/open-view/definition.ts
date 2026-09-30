import {
  buildFrontendToolDefinitionFromZod,
  defineFrontendToolSpec,
} from "@engenty/ag-ui-bridge";
import { z } from "zod";

export const OPEN_VIEW_SPEC = defineFrontendToolSpec({
  availability: "enabled",
  description:
    "Open an app page beside the conversation so the person can work in it while you keep talking — e.g. a module's import page with a file already loaded. On a desk the page opens in a pane next to the chat; when the chat is docked as a companion it opens as the main page. Use it instead of describing steps the page already does. Paths: `/s/<space_key>/<module>/<page>` (query string allowed, e.g. `?file=<storage_key>&name=<filename>`). Set expanded=true for pages that need width (wizards); default false.",
  name: "open_view",
  schema: z.object({
    expanded: z.boolean().optional(),
    path: z.string().min(1),
    title: z.string().optional(),
  }),
  title: "Open View",
});

export const OPEN_VIEW_TOOL =
  buildFrontendToolDefinitionFromZod(OPEN_VIEW_SPEC);
