import { requestApiJson } from "@engenty/api-client";

/**
 * Manage talks only to core's `/api/*` surface. `requestApiJson` unwraps the
 * `{ data }` success envelope automatically — callers get the payload directly.
 * baseUrl is empty: paths are relative and the Vite proxy / prod gateway route
 * them to core.
 */
interface RequestOptions {
  authToken?: string;
  body?: unknown;
  headers?: Record<string, string>;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  signal?: AbortSignal;
}

export async function request<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = "GET", body, headers, signal, authToken } = options;
  return await requestApiJson<T>(path, {
    baseUrl: "",
    method,
    body: body as
      | BodyInit
      | Record<string, unknown>
      | unknown[]
      | null
      | undefined,
    headers,
    signal,
    ...(authToken ? { authToken } : {}),
  });
}
