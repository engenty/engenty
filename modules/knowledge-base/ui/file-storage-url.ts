import { requestApiJson } from "@engenty/api-client";

/** Signed URL for a key in the default files bucket. */
export async function getFileStorageSignedUrl(
  storageKey: string
): Promise<string> {
  const params = new URLSearchParams({ key: storageKey });
  const { url } = await requestApiJson<{ url: string }>(
    `/api/file-storage/files/url?${params.toString()}`,
    { method: "GET" }
  );
  return url;
}
