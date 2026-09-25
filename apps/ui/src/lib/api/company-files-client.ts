/**
 * The company view: the company drive (`/company/files` in a run) and every
 * publishing Space's public folder (`/company/spaces/<key>/`).
 *
 * Reads and writes go through the tenant file-storage routes by key; those
 * routes decide who may write — `core.company_files.manage` for the drive, a
 * Space's own people for its public folder. The page only mirrors that to
 * hide buttons that would 403.
 */
import { requestApiJson } from "@engenty/api-client";

/** Tenant-relative prefix of the company drive (the tenant commons). */
export const COMPANY_FILES_PREFIX = "ai/workspace/commons/";

/** Tenant-relative prefix of a Space's public folder. */
export function spacePublicPrefix(spaceId: string): string {
  return `spaces/${spaceId}/ai/workspace/commons/public/`;
}

export interface CompanySpace {
  color: string | null;
  icon: string | null;
  id: string;
  key: string;
  name: string;
}

export interface CompanyView {
  can_manage_files: boolean;
  spaces: CompanySpace[];
}

export interface CompanyFile {
  filename: string;
  key: string;
  rel_key?: string;
  size_bytes: number;
  updated_at: string;
}

export function getCompanyView(signal?: AbortSignal) {
  return requestApiJson<CompanyView>("/api/company/spaces", { signal });
}

export function listCompanyFiles(prefix: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ limit: "1000", prefix });
  return requestApiJson<CompanyFile[]>(`/api/file-storage/files?${params}`, {
    signal,
  });
}

export async function openCompanyFile(key: string): Promise<void> {
  const params = new URLSearchParams({ key });
  const { url } = await requestApiJson<{ url: string }>(
    `/api/file-storage/files/url?${params}`
  );
  window.open(url, "_blank", "noopener,noreferrer");
}

export function deleteCompanyFile(key: string) {
  const params = new URLSearchParams({ key });
  return requestApiJson<null>(`/api/file-storage/files?${params}`, {
    method: "DELETE",
  });
}

/** Upload one file under `tenants/<tenant>/<prefix><name>`. */
export async function uploadCompanyFile(input: {
  file: File;
  prefix: string;
  tenantId: string;
}): Promise<void> {
  const contentType = input.file.type || "application/octet-stream";
  const signed = await requestApiJson<{
    headers: Record<string, string>;
    url: string;
  }>("/api/file-storage/files/signed-upload-url", {
    body: JSON.stringify({
      content_type: contentType,
      key: `tenants/${input.tenantId}/${input.prefix}${input.file.name}`,
    }),
    method: "POST",
  });
  const headers = new Headers(signed.headers ?? {});
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", contentType);
  }
  const response = await fetch(signed.url, {
    body: input.file,
    headers,
    method: "PUT",
  });
  if (!response.ok) {
    throw new Error(
      (await response.text()) || `Upload failed (${response.status})`
    );
  }
}
