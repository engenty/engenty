/**
 * Shared suggestions artifact contract for HITL flows.
 *
 * Modules declare a stable artifact id (for example `contacts.suggestions`).
 * The apps/ai harness emits `engenty.artifact.created` CUSTOM events with
 * `artifact_type: "field_suggestions"` — not `@ai-sdk-tools/artifacts` streams.
 */
import { z } from "zod";

export const FIELD_SUGGESTIONS_ARTIFACT_TYPE = "field_suggestions" as const;

export const fieldSuggestionCandidateSchema = z.object({
  value: z.union([z.string(), z.null()]),
  source_url: z.url().optional(),
  evidence_snippet: z.string().optional(),
  label: z.string().optional(),
});

export const fieldSuggestionSchema = z.object({
  field: z.string(),
  value: z.union([z.string(), z.null()]),
  source_url: z.url().optional(),
  evidence_snippet: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  candidates: z.array(fieldSuggestionCandidateSchema).optional(),
});

export const fieldSuggestionsPayloadSchema = z.object({
  suggestions: z.array(fieldSuggestionSchema),
});

export type FieldSuggestion = z.infer<typeof fieldSuggestionSchema>;
export type FieldSuggestionCandidate = z.infer<
  typeof fieldSuggestionCandidateSchema
>;

export interface FieldSuggestionsArtifactDefinition {
  id: string;
  schema: typeof fieldSuggestionsPayloadSchema;
}

/** Stable artifact id + payload schema for agent registration and UI filtering. */
export function createFieldSuggestionsArtifact(
  id: string
): FieldSuggestionsArtifactDefinition {
  return {
    id,
    schema: fieldSuggestionsPayloadSchema,
  };
}

export interface FieldSuggestionsArtifactCreatedValue {
  artifact_id: string;
  artifact_type: typeof FIELD_SUGGESTIONS_ARTIFACT_TYPE;
  suggestions: FieldSuggestion[];
}

export interface FieldSuggestionsToolOutput {
  artifact_emitted: true;
  artifact_id: string;
  artifact_type: typeof FIELD_SUGGESTIONS_ARTIFACT_TYPE;
  count: number;
  ok: true;
  suggestions: FieldSuggestion[];
}

export function fieldSuggestionsToolOutputToCreatedValue(
  value: unknown
): FieldSuggestionsArtifactCreatedValue | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    record.ok !== true ||
    record.artifact_emitted !== true ||
    record.artifact_type !== FIELD_SUGGESTIONS_ARTIFACT_TYPE ||
    typeof record.artifact_id !== "string" ||
    !record.artifact_id.trim()
  ) {
    return null;
  }
  const parsed = fieldSuggestionsPayloadSchema.safeParse({
    suggestions: record.suggestions,
  });
  if (!parsed.success) {
    return null;
  }
  return {
    artifact_id: record.artifact_id.trim(),
    artifact_type: FIELD_SUGGESTIONS_ARTIFACT_TYPE,
    suggestions: parsed.data.suggestions,
  };
}

export function parseFieldSuggestionsArtifactCreatedValue(
  value: unknown
): FieldSuggestionsArtifactCreatedValue | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    record.artifact_type !== FIELD_SUGGESTIONS_ARTIFACT_TYPE ||
    typeof record.artifact_id !== "string" ||
    !record.artifact_id.trim()
  ) {
    return fieldSuggestionsToolOutputToCreatedValue(value);
  }
  const parsed = fieldSuggestionsPayloadSchema.safeParse({
    suggestions: record.suggestions,
  });
  if (!parsed.success) {
    return null;
  }
  return {
    artifact_id: record.artifact_id.trim(),
    artifact_type: FIELD_SUGGESTIONS_ARTIFACT_TYPE,
    suggestions: parsed.data.suggestions,
  };
}
