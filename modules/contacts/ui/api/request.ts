import { requestApiEnvelope, requestApiJson } from "@engenty/api-client";

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  return await requestApiJson<T>(path, init);
}

export async function apiRequestEnvelope<T, M = undefined>(
  path: string,
  init: RequestInit = {}
) {
  return await requestApiEnvelope<T, M>(path, init);
}
