/** Allowed image MIME types for team member profile and gallery uploads. */
export const TEAM_MEMBER_PHOTO_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
] as const;

/**
 * Build tenant-scoped vault keys for team member photos.
 * Layout: tenants/<tenant>/team/members/<profile_id>/{profile|gallery}/<stamped-name>
 */
export function teamMemberPhotoStorageKey(input: {
  tenant_id: string;
  profile_id: string;
  filename: string;
  kind: "profile" | "gallery";
  timestamp?: number;
}): string {
  const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const stamped = `${input.timestamp ?? Date.now()}_${safeName}`;
  return [
    "tenants",
    input.tenant_id,
    "team",
    "members",
    input.profile_id,
    input.kind,
    stamped,
  ].join("/");
}

/** Reject storage keys outside the member's team photo prefix. */
export function assertTeamMemberPhotoStorageKey(input: {
  storage_key: string;
  tenant_id: string;
  profile_id: string;
  kind: "profile" | "gallery";
}): void {
  const prefix = [
    "tenants",
    input.tenant_id,
    "team",
    "members",
    input.profile_id,
    input.kind,
  ].join("/");
  if (
    !input.storage_key.startsWith(`${prefix}/`) ||
    input.storage_key.includes("..")
  ) {
    throw new Error("invalid_team_member_photo_storage_key");
  }
}
