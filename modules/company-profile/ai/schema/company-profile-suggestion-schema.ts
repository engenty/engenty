import { z } from "zod";

const suggestionCandidateSchema = z.object({
  value: z.union([z.string(), z.null()]),
  source_url: z.string().url().optional(),
  evidence_snippet: z.string().optional(),
  label: z.string().optional(),
});

export const companyProfileSuggestionSchema = z.object({
  field: z.string().meta({
    description:
      "Company profile field name in snake_case, matching the settings form",
  }),
  value: z.union([z.string(), z.null()]),
  source_url: z.string().url().optional(),
  evidence_snippet: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  candidates: z.array(suggestionCandidateSchema).optional(),
});
