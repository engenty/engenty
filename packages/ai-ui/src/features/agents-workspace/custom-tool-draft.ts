import type { CustomToolConfig } from "../../lib/admin/ai-runtime-api";

export interface CustomToolDraft {
  description: string;
  endpointUrl: string;
  id: string;
  name: string;
  schemaJsonText: string;
}

const DYNAMIC_REGISTRY_ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9-]+)*$/u;

export function validateCustomRegistryId(
  value: string,
  label: string
): string | null {
  const id = value.trim();
  if (!DYNAMIC_REGISTRY_ID_PATTERN.test(id)) {
    return `${label} must use lowercase letters or digits, with optional dot, underscore, or hyphen segments.`;
  }
  return null;
}

export function createEmptyCustomToolDraft(): CustomToolDraft {
  return {
    description: "",
    endpointUrl: "",
    id: "",
    name: "",
    schemaJsonText: '{\n  "type": "object"\n}',
  };
}

export function createCustomToolDraft(tool: CustomToolConfig): CustomToolDraft {
  return {
    description: tool.description ?? "",
    endpointUrl: tool.endpointUrl,
    id: tool.id,
    name: tool.name,
    schemaJsonText: JSON.stringify(tool.schemaJson, null, 2),
  };
}

export function parseCustomToolSchemaJson(
  value: string
): Record<string, unknown> {
  const trimmed = value.trim();
  if (!trimmed) {
    return {};
  }
  const parsed = JSON.parse(trimmed) as unknown;
  if (!(parsed && typeof parsed === "object" && !Array.isArray(parsed))) {
    throw new Error("Tool schema must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

export function validateCustomToolDraft(draft: CustomToolDraft): string | null {
  const idError = validateCustomRegistryId(draft.id, "Tool id");
  if (idError) {
    return idError;
  }
  if (!draft.name.trim()) {
    return "Tool name is required.";
  }
  if (!draft.endpointUrl.trim()) {
    return "Endpoint URL is required.";
  }
  try {
    parseCustomToolSchemaJson(draft.schemaJsonText);
  } catch (error) {
    return error instanceof Error ? error.message : "Tool schema is invalid.";
  }
  return null;
}

export function buildCustomToolConfigFromDraft(
  draft: CustomToolDraft
): CustomToolConfig {
  return {
    description: draft.description.trim() || undefined,
    endpointUrl: draft.endpointUrl.trim(),
    id: draft.id.trim(),
    name: draft.name.trim(),
    schemaJson: parseCustomToolSchemaJson(draft.schemaJsonText),
  };
}
