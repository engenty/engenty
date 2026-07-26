import { requestApiJson } from "@engenty/api-client";

/**
 * Manage talks to core's `/api/*` surface and — for the superadmin AI-plane
 * consoles — the AI service's `/ai/*` surface. `requestApiJson` unwraps the
 * `{ data }` success envelope automatically for core; the AI service replies
 * with bare JSON, so {@link requestAi} skips the unwrap.
 *
 * baseUrl is empty in both cases: paths are relative and the Vite proxy (dev) /
 * prod gateway route them to the right service.
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

/**
 * Call the AI service (`/ai/*`) instead of core.
 *
 * Separate from {@link request} for two reasons: the AI service returns bare
 * JSON rather than core's `{ data }` envelope, and routing differs per
 * environment (dev goes through the `/ai` Vite proxy, prod through the gateway).
 * Every route reached this way is superadmin-gated on the server.
 */
export async function requestAi<T>(
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
    unwrapEnvelope: false,
    ...(authToken ? { authToken } : {}),
  });
}
