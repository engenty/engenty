import { requestApiJson } from "@engenty/api-client";
import { guessFileStorageMimeFromFilename } from "@engenty/file-storage";
import { teamMemberPhotoStorageKey } from "../../src/schema/member-photos.js";

export const TEAM_MEMBER_PHOTO_MAX_BYTES = 10 * 1024 * 1024;

export const TEAM_MEMBER_PHOTO_ACCEPT =
  "image/png,image/jpeg,image/gif,image/webp";

interface FilesSignedUploadPayload {
  bucket: string;
  headers: Record<string, string>;
  key: string;
  url: string;
}

async function requestSignedUploadUrl(input: {
  key: string;
  contentType: string;
}): Promise<FilesSignedUploadPayload> {
  return requestApiJson<FilesSignedUploadPayload>(
    "/api/file-storage/files/signed-upload-url",
    {
      method: "POST",
      body: JSON.stringify({
        key: input.key,
        content_type: input.contentType,
      }),
    }
  );
}

async function uploadViaSignedUrl(
  signed: FilesSignedUploadPayload,
  file: Blob,
  contentType: string
): Promise<void> {
  const headers = new Headers(signed.headers ?? {});
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", contentType);
  }
  const response = await fetch(signed.url, {
    body: file,
    headers,
    method: "PUT",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Signed upload failed (${response.status})`);
  }
}

function resolveUploadContentType(file: File, safeName: string): string {
  const rawType = file.type?.trim() ?? "";
  if (
    !rawType ||
    rawType === "application/octet-stream" ||
    rawType === "application/x-download"
  ) {
    return guessFileStorageMimeFromFilename(safeName);
  }
  return rawType;
}

/** Re-export for tests and callers that prefer the canonical helper. */
export function buildTeamMemberPhotoVaultKey(input: {
  tenantId: string;
  profileId: string;
  filename: string;
  kind: "profile" | "gallery";
  timestamp?: number;
}): string {
  return teamMemberPhotoStorageKey({
    tenant_id: input.tenantId,
    profile_id: input.profileId,
    filename: input.filename,
    kind: input.kind,
    timestamp: input.timestamp,
  });
}

export interface UploadTeamMemberPhotoResult {
  filename: string;
  key: string;
  mime_type: string;
  size_bytes: number;
}

export async function uploadTeamMemberPhotoViaVault(
  file: File,
  opts: {
    tenantId: string;
    profileId: string;
    kind: "profile" | "gallery";
  }
): Promise<UploadTeamMemberPhotoResult> {
  if (!opts.tenantId) {
    throw new Error("upload_tenant_required");
  }
  if (file.size > TEAM_MEMBER_PHOTO_MAX_BYTES) {
    throw new Error("upload_too_large");
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const contentType = resolveUploadContentType(file, safeName);
  const key = buildTeamMemberPhotoVaultKey({
    tenantId: opts.tenantId,
    profileId: opts.profileId,
    filename: file.name,
    kind: opts.kind,
  });

  const signed = await requestSignedUploadUrl({ key, contentType });
  await uploadViaSignedUrl(signed, file, contentType);

  return {
    filename: file.name,
    key: signed.key,
    mime_type: contentType,
    size_bytes: file.size,
  };
}
