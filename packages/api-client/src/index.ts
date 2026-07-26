/**
 * Pluggable API client for engenty. Supports server-first (Supabase session)
 * and satellite (env/config token) modes.
 */
import {
  type ApiSuccessResponse,
  createApiSuccess,
  ENGENTY_SERVICE_ERROR_CODES,
  getApiErrorCode,
  getApiErrorMessage,
  isApiError,
  isApiSuccess,
} from "@engenty/api-contracts";

export interface ApiClientConfig {
  getAccessToken(): Promise<string | null>;
  getApiBaseUrl(): string;
}

export class ApiClientResponseError extends Error {
  code: string;
  details?: unknown;
  fields?: Record<string, string[]>;
  status: number;

  constructor(params: {
    status: number;
    message: string;
    code?: string;
    details?: unknown;
    fields?: Record<string, string[]>;
  }) {
    super(params.message);
    this.name = "ApiClientResponseError";
    this.status = params.status;
    this.code = params.code ?? "unknown_error";
    this.details = params.details;
    this.fields = params.fields;
  }
}

const API_CONNECTION_LOST_MESSAGE =
  "Lost connection to the backend. Check that the API is reachable, then retry.";
const API_BACKEND_UNAVAILABLE_MESSAGE =
  "Backend is unavailable. It may be restarting or still starting up; retry in a moment.";

// A request that is sent but never answered (dev-server restart, hung proxy)
// must fail fast rather than leaving callers pending forever.
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export interface RequestApiJsonOptions extends Omit<RequestInit, "body"> {
  authToken?: string;
  baseUrl?: string;
  body?: BodyInit | null | Record<string, unknown> | unknown[];
  unwrapEnvelope?: boolean;
}

let globalConfig: ApiClientConfig | null = null;

export function setApiClient(config: ApiClientConfig): void {
  globalConfig = config;
}

export function clearApiClient(): void {
  globalConfig = null;
}

export function getApiBaseUrl(): string {
  if (!globalConfig) {
    return "";
  }
  return globalConfig.getApiBaseUrl();
}

export async function getCurrentAccessToken(): Promise<string | null> {
  if (!globalConfig) {
    return null;
  }
  return globalConfig.getAccessToken();
}

export function createApiClient(config: ApiClientConfig): {
  getApiBaseUrl: () => string;
  getCurrentAccessToken: () => Promise<string | null>;
} {
  return {
    getApiBaseUrl: () => config.getApiBaseUrl(),
    getCurrentAccessToken: () => config.getAccessToken(),
  };
}

function isJsonRequestBody(body: RequestApiJsonOptions["body"]) {
  return !(
    body == null ||
    typeof body === "string" ||
    body instanceof Blob ||
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body)
  );
}

function createRequestBody(body: RequestApiJsonOptions["body"]) {
  if (isJsonRequestBody(body)) {
    return JSON.stringify(body);
  }

  return (body ?? undefined) as BodyInit | undefined;
}

async function parseResponseBody(response: Response) {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("json")) {
    return await response.text();
  }

  return await response.json().catch(() => undefined);
}

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

function isNonJsonGatewayFailure(response: Response) {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("json")) {
    return false;
  }

  // Portless and Vite/proxy restarts can return HTML/text 404/5xx pages.
  // Those bodies are diagnostics for developers, not useful UI copy.
  return (
    contentType.includes("html") ||
    response.status === 404 ||
    response.status >= 500
  );
}

function createApiUnreachableError(params: {
  cause?: unknown;
  kind: "connection_lost" | "backend_unavailable";
  status?: number;
}) {
  return new ApiClientResponseError({
    status: params.status ?? 0,
    code: ENGENTY_SERVICE_ERROR_CODES.API_UNREACHABLE,
    message:
      params.kind === "connection_lost"
        ? API_CONNECTION_LOST_MESSAGE
        : API_BACKEND_UNAVAILABLE_MESSAGE,
    details: {
      reason: params.kind,
      ...(params.cause instanceof Error ? { cause: params.cause.message } : {}),
    },
  });
}

export async function requestApiJson<T>(
  path: string,
  options: RequestApiJsonOptions = {}
): Promise<T> {
  const {
    authToken,
    baseUrl,
    body,
    headers,
    unwrapEnvelope = true,
    ...init
  } = options;

  const token = authToken ?? (await getCurrentAccessToken()) ?? "";
  const response = await fetch(`${baseUrl ?? getApiBaseUrl()}${path}`, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS),
    headers: {
      ...(body instanceof FormData
        ? {}
        : { "content-type": "application/json" }),
      ...(token.trim() ? { authorization: `Bearer ${token.trim()}` } : {}),
      ...(headers ?? {}),
    },
    body: createRequestBody(body),
  }).catch((error: unknown) => {
    if (isAbortError(error)) {
      // Callers (and our own default timeout below) treat an abort as a
      // cancellation, not a reportable failure — propagate it untouched.
      throw error;
    }

    throw createApiUnreachableError({ cause: error, kind: "connection_lost" });
  });

  const parsedBody = await parseResponseBody(response);

  if (isApiError(parsedBody)) {
    throw new ApiClientResponseError({
      status: response.status,
      code: parsedBody.error.code,
      message: parsedBody.error.message,
      details: parsedBody.error.details,
      fields: parsedBody.error.fields,
    });
  }

  if (!response.ok) {
    if (isNonJsonGatewayFailure(response)) {
      throw createApiUnreachableError({
        kind: "backend_unavailable",
        status: response.status,
      });
    }

    throw new ApiClientResponseError({
      status: response.status,
      code: getApiErrorCode(parsedBody, "request_failed"),
      message:
        getApiErrorMessage(
          parsedBody,
          typeof parsedBody === "string" && parsedBody
            ? parsedBody
            : response.statusText || "Request failed"
        ) || response.statusText,
      details: parsedBody,
    });
  }

  if (unwrapEnvelope && isApiSuccess(parsedBody)) {
    return parsedBody.data as T;
  }

  return parsedBody as T;
}

export async function requestApiEnvelope<T, M = undefined>(
  path: string,
  options: RequestApiJsonOptions = {}
): Promise<ApiSuccessResponse<T, M>> {
  const parsed = await requestApiJson<unknown>(path, {
    ...options,
    unwrapEnvelope: false,
  });

  if (isApiSuccess(parsed)) {
    return parsed as ApiSuccessResponse<T, M>;
  }

  return createApiSuccess(parsed as T) as ApiSuccessResponse<T, M>;
}
