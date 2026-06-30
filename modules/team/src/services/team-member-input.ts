import type {
  TeamMemberInput,
  TeamMemberUpdateInput,
} from "../schema/types.js";
import { resolveProfileNameForWrite } from "./profile-name.js";

/** Null defaults for optional create/gateway profile fields not covered by name resolution. */
export const teamMemberCreateFieldDefaults = {
  user_id: null,
  import_id: null,
  last_imported_at: null,
  profile_image_storage_key: null,
  phone: null,
  position: null,
  department: null,
  location: null,
} as const satisfies Partial<TeamMemberInput>;

/** Normalize parsed HTTP/gateway/test-data body into a complete {@link TeamMemberInput}. */
export function teamMemberInputForCreate(
  partial: TeamMemberUpdateInput & { full_name?: string | null }
): TeamMemberInput {
  const resolved = resolveProfileNameForWrite(partial);
  const { parts } = resolved;
  return {
    ...teamMemberCreateFieldDefaults,
    member_type: partial.member_type ?? "internal",
    user_id: partial.user_id ?? teamMemberCreateFieldDefaults.user_id,
    import_id: partial.import_id ?? teamMemberCreateFieldDefaults.import_id,
    last_imported_at:
      partial.last_imported_at ??
      teamMemberCreateFieldDefaults.last_imported_at,
    profile_image_storage_key:
      partial.profile_image_storage_key ??
      teamMemberCreateFieldDefaults.profile_image_storage_key,
    role_term_id: partial.role_term_id,
    location_term_id: partial.location_term_id,
    name_prefix: parts.name_prefix,
    first_name: parts.first_name,
    middle_name: parts.middle_name,
    last_name: parts.last_name,
    name_suffix: parts.name_suffix,
    phonetic_name: parts.phonetic_name,
    birth_name: parts.birth_name,
    full_name_override: parts.full_name_override,
    full_name: resolved.full_name,
    initials: resolved.initials ?? partial.initials ?? null,
    phone: partial.phone ?? teamMemberCreateFieldDefaults.phone,
    email: partial.email,
    position: partial.position ?? teamMemberCreateFieldDefaults.position,
    department: partial.department ?? teamMemberCreateFieldDefaults.department,
    location: partial.location ?? teamMemberCreateFieldDefaults.location,
  };
}
