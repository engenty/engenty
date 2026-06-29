import { authenticatedJsonRequest } from "./auth-sdk.js";

export interface CommonOpts {
  apiUrl?: string;
  token?: string;
}

export const defaultApiUrl = "http://127.0.0.1:8787";

export function resolveApiUrl(opts: { apiUrl?: string }): string {
  return opts.apiUrl ?? defaultApiUrl;
}

export function resolveToken(opts: { token?: string }): string | undefined {
  return opts.token;
}

export async function callCoreApi<T>(
  opts: CommonOpts,
  method: "GET" | "POST" | "DELETE",
  endpoint: string,
  body?: unknown
): Promise<T> {
  return authenticatedJsonRequest<T>({
    apiUrl: resolveApiUrl(opts),
    endpoint,
    method,
    token: resolveToken(opts),
    body,
  });
}

export async function callCoreApiWithAcceptedStatuses<T>(
  opts: CommonOpts,
  method: "GET" | "POST" | "DELETE",
  endpoint: string,
  body: unknown,
  acceptStatuses: number[]
): Promise<T> {
  return authenticatedJsonRequest<T>({
    acceptStatuses,
    apiUrl: resolveApiUrl(opts),
    endpoint,
    method,
    token: resolveToken(opts),
    body,
  });
}
