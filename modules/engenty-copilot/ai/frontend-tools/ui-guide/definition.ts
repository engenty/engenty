import {
  buildFrontendToolDefinitionFromZod,
  defineFrontendToolSpec,
} from "@engenty/ag-ui-bridge";
import { z } from "zod";

const uiGuideActionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  variant: z.enum(["primary", "secondary", "ghost"]).optional(),
});

const uiGuideInputSchema = z.object({
  default_value: z.string().optional(),
  label: z.string().optional(),
  placeholder: z.string().optional(),
  required: z.boolean().optional(),
  submit_action_id: z.string().optional(),
  type: z.enum(["text", "textarea"]).optional(),
});

const uiGuideInputFieldSchema = z.object({
  default_value: z.string().optional(),
  id: z.string().min(1),
  label: z.string().optional(),
  placeholder: z.string().optional(),
  required: z.boolean().optional(),
  type: z.enum(["text", "textarea"]).optional(),
});

const uiGuideTargetSchema = z
  .object({
    field_id: z.string().optional(),
    region: z.string().optional(),
    selector: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    const kinds = [value.field_id, value.region, value.selector].filter(
      (part) => typeof part === "string" && part.trim().length > 0
    ).length;
    if (kinds !== 1) {
      ctx.addIssue({
        code: "custom",
        message: "Provide exactly one of field_id, selector, or region.",
      });
    }
  });

const presentationSchema = z.enum(["spotlight", "highlight", "modal"]);

export const SHOW_UI_GUIDE_SPEC = defineFrontendToolSpec({
  availability: "enabled",
  description:
    "Show a UI coach guide. presentation=spotlight (default): dimmed cutout + anchored popout; highlight: ring only (no dim); modal: centered dialog (target optional). Target via field_id / CSS selector / data-engenty-region. Action area: buttons (OK, prev/next, CTAs) plus optional input or inputs[]. Default wait=false; wait=true pauses until the user acts (~3 min max).",
  name: "show_ui_guide",
  schema: z
    .object({
      actions: z.array(uiGuideActionSchema).optional(),
      allow_target_interaction: z.boolean().optional(),
      body: z.string().optional(),
      input: uiGuideInputSchema.optional(),
      inputs: z.array(uiGuideInputFieldSchema).optional(),
      placement: z.enum(["auto", "top", "bottom", "left", "right"]).optional(),
      presentation: presentationSchema.optional(),
      show_dismiss: z.boolean().optional(),
      target: uiGuideTargetSchema.optional(),
      title: z.string().min(1),
      wait: z.boolean().optional(),
    })
    .superRefine((value, ctx) => {
      const presentation = value.presentation ?? "spotlight";
      if (presentation !== "modal" && !value.target) {
        ctx.addIssue({
          code: "custom",
          message: `target is required when presentation is "${presentation}".`,
          path: ["target"],
        });
      }
      if (value.input && value.inputs?.length) {
        ctx.addIssue({
          code: "custom",
          message: "Use either input or inputs, not both.",
          path: ["inputs"],
        });
      }
    }),
  title: "Show UI Guide",
});

export const SHOW_UI_GUIDE_TOOL =
  buildFrontendToolDefinitionFromZod(SHOW_UI_GUIDE_SPEC);

export const UPDATE_UI_GUIDE_SPEC = defineFrontendToolSpec({
  availability: "enabled",
  description:
    "Update the active UI guide (title, body, actions, target, input(s), presentation). Errors if none is open. Set wait=true to begin waiting for the next user action.",
  name: "update_ui_guide",
  schema: z
    .object({
      actions: z.array(uiGuideActionSchema).optional(),
      allow_target_interaction: z.boolean().optional(),
      body: z.string().nullable().optional(),
      input: uiGuideInputSchema.nullable().optional(),
      inputs: z.array(uiGuideInputFieldSchema).nullable().optional(),
      placement: z.enum(["auto", "top", "bottom", "left", "right"]).optional(),
      presentation: presentationSchema.optional(),
      show_dismiss: z.boolean().optional(),
      target: uiGuideTargetSchema.optional(),
      title: z.string().min(1).optional(),
      wait: z.boolean().optional(),
    })
    .superRefine((value, ctx) => {
      if (value.input && value.inputs?.length) {
        ctx.addIssue({
          code: "custom",
          message: "Use either input or inputs, not both.",
          path: ["inputs"],
        });
      }
    }),
  title: "Update UI Guide",
});

export const UPDATE_UI_GUIDE_TOOL =
  buildFrontendToolDefinitionFromZod(UPDATE_UI_GUIDE_SPEC);

export const DISMISS_UI_GUIDE_SPEC = defineFrontendToolSpec({
  availability: "enabled",
  description:
    "Dismiss the active UI guide overlay. If the guide was waiting, resolves that wait as dismissed.",
  name: "dismiss_ui_guide",
  schema: z.object({}),
  title: "Dismiss UI Guide",
});

export const DISMISS_UI_GUIDE_TOOL = buildFrontendToolDefinitionFromZod(
  DISMISS_UI_GUIDE_SPEC
);
