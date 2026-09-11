// Thin fetch wrapper for apps/core `/api/*` routes (admin catalog, settings, triggers).

import {
  type RequestApiJsonOptions,
  requestApiJson,
} from "@engenty/api-client";

/**
 * `body` takes the plain object, not a JSON string: the client stringifies it
 * AND sets `content-type` itself. A caller that adds its own content-type
 * header sends the value twice, and the route then does not read the request
 * as JSON at all.
 */
export async function request<T>(
  path: string,
  init?: RequestApiJsonOptions
): Promise<T> {
  return await requestApiJson<T>(path, init);
}
