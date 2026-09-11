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
/** File bytes can be large and slow (local-files bridge); 15s would abort a PDF. */
const BINARY_REQUEST_TIMEOUT_MS = 120_000;

export interface RequestApiJsonOptions extends Omit<RequestInit, "body"> {
  authToken?: string;
  baseUrl?: string;
  body?: BodyInit | null | Record<string, unknown> | unknown[];
  unwrapEnvelope?: boolean;
}

let globalConfig: ApiClientConfig | null = null;

/**
 * Where the caller is working, for `x-engenty-space-id` (PLAN-spaces.md CN.3).
 *
 * Separate from {@link ApiClientConfig} because the app that KNOWS the space
 * (apps/ui, from the router) and the package that configures the client
 * (auth-ui) are not the same one, and threading spaces through auth would tie
 * two unrelated things together. A provider rather than a value: the space
 * changes on every navigation, and a snapshot taken at wiring time would be
 * wrong from the first route change onwards.
 *
 * Unset means no header, which is exactly the pre-spaces behaviour — every
 * consumer of this header treats absence as "do not narrow".
 */
let spaceIdProvider: (() => string | null) | null = null;

export function setApiClient(config: ApiClientConfig): void {
  globalConfig = config;
}

/** Register (or clear, with null) the current-space provider. */
export function setApiClientSpaceProvider(
  provider: (() => string | null) | null
): void {
  spaceIdProvider = provider;
}

export function clearApiClient(): void {
  globalConfig = null;
  spaceIdProvider = null;
}

/**
 * The space the registered provider currently reports, for callers that must
 * key a cache on it — a query whose response the server narrows by the space
 * header is a different query per space.
 */
export function currentRequestSpaceId(): string | null {
  try {
    return spaceIdProvider?.()?.trim() || null;
  } catch {
    return null;
  }
}

function currentSpaceHeader(): Record<string, string> {
  let spaceId: string | null = null;
  try {
    spaceId = spaceIdProvider?.() ?? null;
  } catch {
    // A provider that throws must not take every request down with it — the
    // header is a narrowing hint, not a credential.
    spaceId = null;
  }
  return spaceId?.trim() ? { "x-engenty-space-id": spaceId.trim() } : {};
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
      ...currentSpaceHeader(),
      // Explicit headers win, so a caller that means a DIFFERENT space (or
      // deliberately none) can say so.
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

/**
 * Authenticated file bytes. An `<iframe src>` or `<a href>` never sends the
 * Bearer token {@link requestApiJson} attaches, so a same-origin `/download`
 * proxy answers 401 JSON and the browser renders that instead of the file.
 */
export async function requestApiBlob(
  path: string,
  options: RequestApiJsonOptions = {}
): Promise<Blob> {
  const {
    authToken,
    baseUrl,
    body,
    headers,
    unwrapEnvelope: _unwrapEnvelope,
    ...init
  } = options;

  const token = authToken ?? (await getCurrentAccessToken()) ?? "";
  const response = await fetch(`${baseUrl ?? getApiBaseUrl()}${path}`, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(BINARY_REQUEST_TIMEOUT_MS),
    headers: {
      ...(token.trim() ? { authorization: `Bearer ${token.trim()}` } : {}),
      ...currentSpaceHeader(),
      ...(headers ?? {}),
    },
    body: createRequestBody(body),
  }).catch((error: unknown) => {
    if (isAbortError(error)) {
      throw error;
    }

    throw createApiUnreachableError({ cause: error, kind: "connection_lost" });
  });

  if (!response.ok) {
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

  return response.blob();
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
