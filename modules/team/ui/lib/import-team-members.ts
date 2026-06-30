import type { ImportFieldDefinition, PreviewColumn } from "@engenty/import";
import { resolveProfileNameForWrite } from "../../src/services/profile-name.js";
import type {
  TeamMemberCreateInput,
  TeamMemberUpdateInput,
  TeamTaxonomyTerm,
} from "../api.js";

export interface ImportTaxonomyContext {
  locationTerms: TeamTaxonomyTerm[];
  roleTerms: TeamTaxonomyTerm[];
}

function toNullable(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function parseImportMemberType(
  raw: string | undefined
): "internal" | "external" | "contractor" {
  const v = raw?.trim().toLowerCase() ?? "";
  if (v === "external" || v === "extern") {
    return "external";
  }
  if (v === "contractor" || v === "freelancer") {
    return "contractor";
  }
  return "internal";
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value.trim());
}

export function resolveImportTaxonomyTerm(
  raw: string | undefined,
  terms: TeamTaxonomyTerm[]
): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return;
  }
  if (isUuid(trimmed)) {
    const byId = terms.find((term) => term.id === trimmed);
    return byId?.id ?? trimmed;
  }
  const lower = trimmed.toLowerCase();
  const match = terms.find(
    (term) =>
      term.term_slug.toLowerCase() === lower ||
      term.label.trim().toLowerCase() === lower
  );
  return match?.id;
}

/** Prefer taxonomy columns; fall back to legacy free-text location for term creation. */
export function normalizeImportRowTaxonomyColumns(
  row: Record<string, string>
): Record<string, string> {
  const next = { ...row };
  if (!next.role_term?.trim() && next.role?.trim()) {
    next.role_term = next.role;
  }
  if (!next.location_term?.trim() && next.location?.trim()) {
    next.location_term = next.location;
  }
  return next;
}

export const TEAM_IMPORT_FIELDS: ImportFieldDefinition[] = [
  {
    key: "name_prefix",
    label: "Title (prefix)",
    type: "text",
    required: false,
    description: "Titel vorangestellt (e.g. Dr., Prof.)",
  },
  {
    key: "first_name",
    label: "First name",
    type: "text",
    required: false,
    description: "Vorname",
  },
  {
    key: "middle_name",
    label: "Middle name",
    type: "text",
    required: false,
    description: "Mittelname / zweiter Vorname",
  },
  {
    key: "last_name",
    label: "Last name",
    type: "text",
    required: false,
    description: "Nachname (required when full name is not mapped)",
  },
  {
    key: "name_suffix",
    label: "Title (suffix)",
    type: "text",
    required: false,
    description: "Titel nachgestellt (e.g. MBA)",
  },
  {
    key: "phonetic_name",
    label: "Phonetic name",
    type: "text",
    required: false,
    description: "Name (phonetisch)",
  },
  {
    key: "birth_name",
    label: "Birth name",
    type: "text",
    required: false,
    description: "Geburtsname",
  },
  {
    key: "full_name",
    label: "Full name",
    type: "text",
    required: false,
    description:
      "Legacy display name. Used when structured name columns are empty; can be split into parts on import.",
    examples: ["Jane Doe", "Max Mustermann"],
  },
  {
    key: "import_id",
    label: "Import ID",
    type: "text",
    required: false,
    description: "External ID for matching on re-import",
  },
  {
    key: "email",
    label: "Email",
    type: "email",
    required: false,
    description: "Work email (also used as fallback match on re-import)",
  },
  {
    key: "member_type",
    label: "Member type",
    type: "text",
    required: false,
    description: "internal, external, or contractor (default internal)",
  },
  {
    key: "initials",
    label: "Initials",
    type: "text",
    required: false,
    description: "Short initials for avatars",
  },
  {
    key: "phone",
    label: "Phone",
    type: "phone",
    required: false,
    description: "Work phone number",
  },
  {
    key: "position",
    label: "Position",
    type: "text",
    required: false,
    description: "Job position or title line in directory",
  },
  {
    key: "department",
    label: "Department",
    type: "text",
    required: false,
    description: "Department name",
  },
  {
    key: "role_term_id",
    label: "Role term ID",
    type: "text",
    required: false,
    description: "Stable role taxonomy term UUID (optional round-trip column).",
  },
  {
    key: "role_term",
    label: "Role",
    type: "text",
    required: false,
    description:
      "Role taxonomy term (slug or label). Created automatically when missing. Synonyms: Rolle, Funktion, Team role.",
    examples: ["Engineering", "Geschäftsführer", "Agenturleitung"],
  },
  {
    key: "location_term_id",
    label: "Location term ID",
    type: "text",
    required: false,
    description:
      "Stable location taxonomy term UUID (optional round-trip column).",
  },
  {
    key: "location_term",
    label: "Location term",
    type: "text",
    required: false,
    description:
      "Location taxonomy term (slug or label). Created automatically when missing. Synonyms: Standort, Office, Site.",
    examples: ["Vienna", "Berlin", "Remote"],
  },
  {
    key: "location",
    label: "Location",
    type: "text",
    required: false,
    description:
      "Free-text location (legacy directory field). Also used as location taxonomy when Location term is empty.",
  },
];

export const TEAM_IMPORT_PREVIEW_COLUMNS: PreviewColumn[] = [
  { key: "last_name", label: "Last name" },
  { key: "first_name", label: "First name" },
  { key: "full_name", label: "Full name" },
  { key: "import_id", label: "Import ID" },
  { key: "email", label: "Email" },
  { key: "member_type", label: "Member type" },
  { key: "position", label: "Position" },
  { key: "department", label: "Department" },
  { key: "role_term", label: "Role" },
  { key: "location_term", label: "Location term" },
  { key: "phone", label: "Phone" },
];

const PATCHABLE_KEYS = [
  "name_prefix",
  "first_name",
  "middle_name",
  "last_name",
  "name_suffix",
  "phonetic_name",
  "birth_name",
  "full_name",
  "full_name_override",
  "initials",
  "phone",
  "email",
  "position",
  "department",
  "location",
  "member_type",
  "role_term_id",
  "role_term",
  "location_term_id",
  "location_term",
] as const;

export function mapImportRowToTeamMemberCreateInput(
  row: Record<string, string>,
  taxonomy: ImportTaxonomyContext
): TeamMemberCreateInput {
  const memberType = parseImportMemberType(row.member_type);
  const roleTermId =
    resolveImportTaxonomyTerm(row.role_term_id, taxonomy.roleTerms) ??
    resolveImportTaxonomyTerm(row.role_term, taxonomy.roleTerms);
  const locationTermId =
    resolveImportTaxonomyTerm(row.location_term_id, taxonomy.locationTerms) ??
    resolveImportTaxonomyTerm(row.location_term, taxonomy.locationTerms);

  const resolved = resolveProfileNameForWrite({
    name_prefix: row.name_prefix,
    first_name: row.first_name,
    middle_name: row.middle_name,
    last_name: row.last_name,
    name_suffix: row.name_suffix,
    phonetic_name: row.phonetic_name,
    birth_name: row.birth_name,
    full_name: row.full_name,
    initials: row.initials,
  });

  return {
    ...resolved.parts,
    full_name: resolved.full_name,
    member_type: memberType,
    user_id: null,
    profile_image_storage_key: null,
    initials: resolved.initials,
    phone: toNullable(row.phone),
    email: toNullable(row.email),
    position: toNullable(row.position),
    department: toNullable(row.department),
    location: toNullable(row.location),
    import_id: toNullable(row.import_id),
    ...(roleTermId ? { role_term_id: roleTermId } : {}),
    ...(locationTermId ? { location_term_id: locationTermId } : {}),
  };
}

export function mapImportRowToTeamMemberUpdatePatch(
  row: Record<string, string>,
  importId: string | null,
  lastImportedAt: string,
  taxonomy: ImportTaxonomyContext
): TeamMemberUpdateInput {
  const patch: TeamMemberUpdateInput = {
    last_imported_at: lastImportedAt,
    import_id: importId ?? toNullable(row.import_id),
  };

  for (const key of PATCHABLE_KEYS) {
    const value = row[key];
    const trimmed = value?.trim();
    if (trimmed === undefined || trimmed === "") {
      continue;
    }
    if (key === "member_type") {
      patch.member_type = parseImportMemberType(value);
      continue;
    }
    if (key === "role_term_id" || key === "role_term") {
      const resolved = resolveImportTaxonomyTerm(value, taxonomy.roleTerms);
      if (resolved) {
        patch.role_term_id = resolved;
      }
      continue;
    }
    if (key === "location_term_id" || key === "location_term") {
      const resolved = resolveImportTaxonomyTerm(value, taxonomy.locationTerms);
      if (resolved) {
        patch.location_term_id = resolved;
      }
      continue;
    }
    (patch as Record<string, unknown>)[key] = toNullable(value);
  }

  return patch;
}
