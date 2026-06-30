/** Structured profile name: format, derive display name, split legacy full_name. */

export interface ProfileNameParts {
  birth_name: string | null;
  first_name: string | null;
  full_name_override: string | null;
  last_name: string | null;
  middle_name: string | null;
  name_prefix: string | null;
  name_suffix: string | null;
  phonetic_name: string | null;
}

const PREFIX_TOKENS = new Set([
  "dr",
  "dr.",
  "prof",
  "prof.",
  "professor",
  "herr",
  "frau",
  "mr",
  "mr.",
  "mrs",
  "mrs.",
  "ms",
  "ms.",
]);

const SUFFIX_TOKENS = new Set([
  "mba",
  "b.sc",
  "b.sc.",
  "m.sc",
  "m.sc.",
  "phd",
  "ph.d",
  "ph.d.",
  "jr",
  "jr.",
  "sen",
  "sen.",
]);

export function normalizeNullableNamePart(
  value: string | null | undefined
): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function hasAnyStructuredNamePart(
  parts: Partial<ProfileNameParts>
): boolean {
  return Boolean(
    normalizeNullableNamePart(parts.name_prefix) ||
      normalizeNullableNamePart(parts.first_name) ||
      normalizeNullableNamePart(parts.middle_name) ||
      normalizeNullableNamePart(parts.last_name) ||
      normalizeNullableNamePart(parts.name_suffix)
  );
}

export function formatDisplayName(parts: Partial<ProfileNameParts>): string {
  const prefix = normalizeNullableNamePart(parts.name_prefix);
  const first = normalizeNullableNamePart(parts.first_name);
  const middle = normalizeNullableNamePart(parts.middle_name);
  const last = normalizeNullableNamePart(parts.last_name);
  const suffix = normalizeNullableNamePart(parts.name_suffix);

  const leading: string[] = [];
  if (prefix) {
    leading.push(prefix);
  }
  if (first) {
    leading.push(first);
  }
  if (middle) {
    leading.push(middle);
  }
  if (last) {
    leading.push(last);
  }

  let display = leading.join(" ").trim();
  if (suffix) {
    display = display ? `${display} ${suffix}` : suffix;
  }
  return display;
}

export function deriveInitialsFromParts(
  parts: Partial<ProfileNameParts>
): string | null {
  const first = normalizeNullableNamePart(parts.first_name);
  const last = normalizeNullableNamePart(parts.last_name);
  const f = first?.[0];
  const l = last?.[0];
  if (f && l) {
    return `${f}${l}`.toUpperCase();
  }
  if (f) {
    return f.toUpperCase();
  }
  if (l) {
    return l.toUpperCase();
  }
  return null;
}

function tokenKey(token: string): string {
  return token.toLowerCase().replace(/\.$/, "");
}

/** Best-effort split for migration, import legacy full_name, and AI assist. */
export function splitFullNameHeuristic(fullName: string): ProfileNameParts {
  const trimmed = fullName.trim();
  if (!trimmed) {
    return emptyNameParts();
  }

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return emptyNameParts();
  }

  let start = 0;
  let end = tokens.length;

  const prefixes: string[] = [];
  while (start < end && PREFIX_TOKENS.has(tokenKey(tokens[start] ?? ""))) {
    prefixes.push(tokens[start] ?? "");
    start += 1;
  }

  const suffixes: string[] = [];
  while (end > start && SUFFIX_TOKENS.has(tokenKey(tokens[end - 1] ?? ""))) {
    suffixes.unshift(tokens[end - 1] ?? "");
    end -= 1;
  }

  const core = tokens.slice(start, end);
  let first_name: string | null = null;
  let middle_name: string | null = null;
  let last_name: string | null = null;

  if (core.length === 1) {
    last_name = core[0] ?? null;
  } else if (core.length === 2) {
    first_name = core[0] ?? null;
    last_name = core[1] ?? null;
  } else if (core.length >= 3) {
    first_name = core[0] ?? null;
    last_name = core.at(-1) ?? null;
    middle_name = core.slice(1, -1).join(" ") || null;
  }

  return {
    name_prefix: prefixes.length > 0 ? prefixes.join(" ") : null,
    first_name,
    middle_name,
    last_name,
    name_suffix: suffixes.length > 0 ? suffixes.join(" ") : null,
    phonetic_name: null,
    birth_name: null,
    full_name_override: null,
  };
}

export function emptyNameParts(): ProfileNameParts {
  return {
    name_prefix: null,
    first_name: null,
    middle_name: null,
    last_name: null,
    name_suffix: null,
    phonetic_name: null,
    birth_name: null,
    full_name_override: null,
  };
}

export type ProfileNameWriteInput = Partial<ProfileNameParts> & {
  full_name?: string | null;
  initials?: string | null;
};

export function resolveProfileNameForWrite(input: ProfileNameWriteInput): {
  parts: ProfileNameParts;
  full_name: string;
  initials: string | null;
} {
  let parts: ProfileNameParts = {
    name_prefix: normalizeNullableNamePart(input.name_prefix),
    first_name: normalizeNullableNamePart(input.first_name),
    middle_name: normalizeNullableNamePart(input.middle_name),
    last_name: normalizeNullableNamePart(input.last_name),
    name_suffix: normalizeNullableNamePart(input.name_suffix),
    phonetic_name: normalizeNullableNamePart(input.phonetic_name),
    birth_name: normalizeNullableNamePart(input.birth_name),
    full_name_override: normalizeNullableNamePart(input.full_name_override),
  };

  const legacyFull = normalizeNullableNamePart(input.full_name);

  if (!hasAnyStructuredNamePart(parts) && legacyFull) {
    parts = splitFullNameHeuristic(legacyFull);
    parts.phonetic_name = normalizeNullableNamePart(input.phonetic_name);
    parts.birth_name = normalizeNullableNamePart(input.birth_name);
    parts.full_name_override = normalizeNullableNamePart(
      input.full_name_override
    );
  }

  const override = parts.full_name_override;
  let full_name: string;
  if (override) {
    full_name = override;
  } else if (hasAnyStructuredNamePart(parts)) {
    full_name = formatDisplayName(parts);
  } else {
    full_name = legacyFull ?? "";
  }

  const explicitInitials = normalizeNullableNamePart(input.initials);
  const initials = explicitInitials ?? deriveInitialsFromParts(parts) ?? null;

  return { parts, full_name, initials };
}

export function isProfileNameWriteValid(input: ProfileNameWriteInput): boolean {
  const override = normalizeNullableNamePart(input.full_name_override);
  if (override) {
    return true;
  }
  const last = normalizeNullableNamePart(input.last_name);
  if (last) {
    return true;
  }
  const legacy = normalizeNullableNamePart(input.full_name);
  if (legacy && !hasAnyStructuredNamePart(input)) {
    return true;
  }
  return false;
}
