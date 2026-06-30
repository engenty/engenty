import { requestApiJson } from "@engenty/api-client";

export async function getTeamFileStorageSignedUrl(
  storageKey: string
): Promise<string> {
  const params = new URLSearchParams({ key: storageKey });
  const { url } = await requestApiJson<{ url: string }>(
    `/api/file-storage/files/url?${params.toString()}`,
    { method: "GET" }
  );
  return url;
}
