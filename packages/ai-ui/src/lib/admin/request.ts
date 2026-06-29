// Thin fetch wrapper for apps/core `/api/*` routes (admin catalog, settings, triggers).

import { requestApiJson } from "@engenty/api-client";

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return await requestApiJson<T>(path, init);
}
