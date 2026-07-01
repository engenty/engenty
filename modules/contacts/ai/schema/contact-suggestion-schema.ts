import { z } from "zod";

const suggestionCandidateSchema = z.object({
  value: z.union([z.string(), z.null()]),
  source_url: z.string().url().optional(),
  evidence_snippet: z.string().optional(),
  label: z
    .string()
    .optional()
    .meta({ description: "Display label (e.g. company name + FN)" }),
});

/** Per-field provenance for suggested updates. Use field "add_role_client", "add_role_partner", etc. with value "true" to suggest adding a role. */
export const contactSuggestionSchema = z.object({
  field: z.string().meta({
    description:
      "Contact field name (snake_case), or add_role_<role> for role suggestions",
  }),
  value: z
    .union([z.string(), z.null()])
    .meta({ description: "Suggested value (or default when candidates)" }),
  source_url: z
    .string()
    .url()
    .optional()
    .meta({ description: "URL where info was found" }),
  evidence_snippet: z
    .string()
    .optional()
    .meta({ description: "Quote or snippet from source" }),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .meta({ description: "Confidence 0-1" }),
  /** When multiple options exist (e.g. subsidiaries), let user choose. If set, UI shows radio/select. */
  candidates: z.array(suggestionCandidateSchema).optional().meta({
    description:
      "Multiple options for this field; user picks one. Use when multiple companies match.",
  }),
});

export type ContactSuggestion = z.infer<typeof contactSuggestionSchema>;
export type SuggestionCandidate = z.infer<typeof suggestionCandidateSchema>;
