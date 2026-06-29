/**
 * `propose_updates` — a voice frontend tool that lets the realtime agent
 * propose field-value updates to the current record. Unlike the text runtime
 * (where `proposeUpdates` is a server-side agent tool that suspends a workflow),
 * the voice agent calls this tool; the provider parks the suggestions as a
 * field-suggestions confirmation rendered with the same HitlApprovalCard the
 * action button uses. Approved fields are applied generically by context_type.
 */
import { createFrontendToolDefinition } from "@engenty/ag-ui-bridge";
import type {
  VoiceFieldSuggestion,
  VoiceFieldSuggestionCandidate,
} from "./voice-pending-confirmation.js";

export const PROPOSE_UPDATES_VOICE_TOOL = createFrontendToolDefinition({
  availability: "enabled",
  description:
    "Propose field-value updates to the record the user is currently viewing, for the user to review and apply. Use after you have researched concrete values. Provide context_type and context_id from the current UI selection (e.g. context_type 'contacts.contact'). Each suggestion needs a field and value; add evidence_snippet and source_url when you have a source. This opens a review dialog — do not assume the updates are applied until the user confirms.",
  name: "propose_updates",
  owner_module_id: "engenty-copilot",
  parameters: {
    additionalProperties: false,
    properties: {
      context_id: {
        description: "Id of the subject record (the current entity).",
        type: "string",
      },
      context_type: {
        description:
          "Dotted subject type '<module>.<entity>', e.g. 'contacts.contact'.",
        type: "string",
      },
      suggestions: {
        items: {
          additionalProperties: false,
          properties: {
            evidence_snippet: { type: "string" },
            field: { type: "string" },
            source_url: { type: "string" },
            value: { type: ["string", "null"] },
          },
          required: ["field", "value"],
          type: "object",
        },
        minItems: 1,
        type: "array",
      },
      title: {
        description: "Optional heading for the review dialog.",
        type: "string",
      },
    },
    required: ["context_id", "context_type", "suggestions"],
    type: "object",
  },
  safety: "safe",
  title: "Propose field updates",
});

export interface VoiceProposeUpdatesArgs {
  contextId: string;
  contextType: string;
  suggestions: VoiceFieldSuggestion[];
  title?: string;
}

/** Parse + validate the agent's `propose_updates` arguments; null when invalid. */
export function parseVoiceProposeUpdatesArgs(
  raw: unknown
): VoiceProposeUpdatesArgs | null {
  const record = asRecord(raw);
  if (!record) {
    return null;
  }
  const contextId = asNonEmptyString(record.context_id);
  const contextType = asNonEmptyString(record.context_type);
  if (!(contextId && contextType)) {
    return null;
  }
  const suggestions = Array.isArray(record.suggestions)
    ? record.suggestions.flatMap(parseSuggestion)
    : [];
  if (suggestions.length === 0) {
    return null;
  }
  return {
    contextId,
    contextType,
    suggestions,
    ...(asNonEmptyString(record.title)
      ? { title: asNonEmptyString(record.title) as string }
      : {}),
  };
}

function parseSuggestion(raw: unknown): VoiceFieldSuggestion[] {
  const record = asRecord(raw);
  if (!record) {
    return [];
  }
  const field = asNonEmptyString(record.field);
  if (!field) {
    return [];
  }
  const value = asNullableString(record.value);
  const candidates = Array.isArray(record.candidates)
    ? record.candidates.flatMap(parseCandidate)
    : undefined;
  return [
    {
      field,
      value,
      ...(record.evidence_snippet
        ? { evidence_snippet: String(record.evidence_snippet) }
        : {}),
      ...(record.source_url ? { source_url: String(record.source_url) } : {}),
      ...(candidates && candidates.length > 0 ? { candidates } : {}),
    },
  ];
}

function parseCandidate(raw: unknown): VoiceFieldSuggestionCandidate[] {
  const record = asRecord(raw);
  if (!record) {
    return [];
  }
  return [
    {
      value: asNullableString(record.value),
      ...(record.label ? { label: String(record.label) } : {}),
      ...(record.source_url ? { source_url: String(record.source_url) } : {}),
      ...(record.evidence_snippet
        ? { evidence_snippet: String(record.evidence_snippet) }
        : {}),
    },
  ];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
