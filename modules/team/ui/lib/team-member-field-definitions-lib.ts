import type {
  TeamMemberFieldDefinitionInput,
  TeamMemberFieldType,
  TeamMemberFieldVisibility,
} from "../../src/schema/member-field-definitions.js";
import { teamMemberFieldTypeSupportsMultiple } from "../../src/schema/member-field-definitions.js";

export function slugFromFieldLabel(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64);
}

export function newTeamMemberFieldDefinition(
  visibility: TeamMemberFieldVisibility,
  sortOrder: number
): TeamMemberFieldDefinitionInput {
  return {
    id: crypto.randomUUID(),
    visibility,
    field_type: "text_input",
    label: "",
    description: "",
    field_key: "",
    options: [],
    sort_order: sortOrder,
    multiple: false,
  };
}

export function normalizeTeamMemberFieldDefinitionsForSave(
  definitions: TeamMemberFieldDefinitionInput[]
): TeamMemberFieldDefinitionInput[] {
  const visibilityOrder: Record<TeamMemberFieldVisibility, number> = {
    shared: 0,
    private: 1,
    employment: 2,
  };

  const prepared = definitions
    .map((definition) => {
      const field_type = definition.field_type;
      const multiple = teamMemberFieldTypeSupportsMultiple(field_type)
        ? definition.multiple
        : false;
      const options =
        field_type === "select"
          ? (definition.options ?? [])
              .map((option) => option.trim())
              .filter(Boolean)
          : [];
      return {
        ...definition,
        label: definition.label.trim(),
        description: definition.description.trim(),
        field_key: definition.field_key.trim(),
        field_type,
        multiple,
        options,
      };
    })
    .filter((definition) => definition.label && definition.field_key);

  const sorted = [...prepared].sort((a, b) => {
    const sectionDelta =
      visibilityOrder[a.visibility] - visibilityOrder[b.visibility];
    if (sectionDelta !== 0) {
      return sectionDelta;
    }
    return a.sort_order - b.sort_order;
  });

  const sectionCounters: Record<TeamMemberFieldVisibility, number> = {
    shared: 0,
    private: 0,
    employment: 0,
  };

  return sorted.map((definition) => {
    const sort_order = sectionCounters[definition.visibility];
    sectionCounters[definition.visibility] += 1;
    return { ...definition, sort_order };
  });
}

export function reorderTeamMemberFieldDefinitions(
  list: TeamMemberFieldDefinitionInput[],
  sourceId: string,
  targetId: string,
  place: "before" | "after"
): TeamMemberFieldDefinitionInput[] {
  if (sourceId === targetId) {
    return list;
  }
  const source = list.find((row) => row.id === sourceId);
  const target = list.find((row) => row.id === targetId);
  if (!(source && target) || source.visibility !== target.visibility) {
    return list;
  }
  const from = list.findIndex((row) => row.id === sourceId);
  const to = list.findIndex((row) => row.id === targetId);
  if (from < 0 || to < 0) {
    return list;
  }
  const next = list.filter((row) => row.id !== sourceId);
  const targetIndex = next.findIndex((row) => row.id === targetId);
  if (targetIndex < 0) {
    return list;
  }
  let insertIndex = place === "before" ? targetIndex : targetIndex + 1;
  const adjust = from < insertIndex ? 1 : 0;
  insertIndex -= adjust;
  insertIndex = Math.max(0, Math.min(insertIndex, next.length));
  next.splice(insertIndex, 0, source);
  return reindexVisibilitySortOrders(next);
}

function reindexVisibilitySortOrders(
  list: TeamMemberFieldDefinitionInput[]
): TeamMemberFieldDefinitionInput[] {
  const counters: Record<TeamMemberFieldVisibility, number> = {
    shared: 0,
    private: 0,
    employment: 0,
  };
  return list.map((row) => {
    const sort_order = counters[row.visibility];
    counters[row.visibility] += 1;
    return { ...row, sort_order };
  });
}

export function parseSelectOptions(raw: string): string[] {
  return raw
    .split(",")
    .map((option) => option.trim())
    .filter(Boolean);
}

export function serializeSelectOptions(options: string[] | undefined): string {
  return (options ?? []).join(", ");
}

export const TEAM_MEMBER_FIELD_TYPES: TeamMemberFieldType[] = [
  "text_input",
  "text_formatted",
  "text_tiptap",
  "number",
  "date",
  "date_range",
  "url",
  "image",
  "file",
  "select",
];
