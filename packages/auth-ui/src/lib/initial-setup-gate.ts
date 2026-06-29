import {
  ENGENTY_SERVICE_ERROR_CODES,
  getApiErrorCode,
  isApiError,
} from "@engenty/api-contracts";
import { getApiBaseUrl } from "./api-client";

export interface InitialSetupGateReady {
  initial_setup_required: boolean;
  status: "ready";
}

export type InitialSetupGateFailure =
  | {
      status: "database_unavailable";
      error_code: typeof ENGENTY_SERVICE_ERROR_CODES.DB_UNAVAILABLE;
      message: string;
      details?: Record<string, string>;
    }
  | {
      status: "api_unreachable";
      error_code: typeof ENGENTY_SERVICE_ERROR_CODES.API_UNREACHABLE;
      message: string;
      api_base_url: string;
    }
  | {
      status: "backend_error";
      error_code: typeof ENGENTY_SERVICE_ERROR_CODES.SETUP_BACKEND_ERROR;
      message: string;
      http_status: number;
    };

export type InitialSetupGateResult =
  | InitialSetupGateReady
  | InitialSetupGateFailure;

export class EngentyServiceAvailabilityError extends Error {
  readonly failure: InitialSetupGateFailure;

  constructor(failure: InitialSetupGateFailure) {
    super(failure.message);
    this.name = "EngentyServiceAvailabilityError";
    this.failure = failure;
  }
}

export function isEngentyServiceAvailabilityError(
  e: unknown
): e is EngentyServiceAvailabilityError {
  return e instanceof EngentyServiceAvailabilityError;
}

export function readSetupApiErrorMessage(
  payload: unknown,
  fallback: string
): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  if (isApiError(payload)) {
    return payload.error.message;
  }
  return fallback;
}

export async function readResponseJsonLoose(
  response: Response
): Promise<unknown> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("json")) {
    return await response.text();
  }
  return await response.json().catch(() => undefined);
}

export function gateFailureToNavigationState(
  failure: InitialSetupGateFailure
): ServiceUnavailableNavigationState {
  switch (failure.status) {
    case "database_unavailable":
      return {
        reason: "database_unavailable",
        error_code: failure.error_code,
        message: failure.message,
        ...(failure.details ? { details: failure.details } : {}),
      };
    case "api_unreachable":
      return {
        reason: "api_unreachable",
        error_code: failure.error_code,
        message: failure.message,
        api_base_url: failure.api_base_url,
      };
    case "backend_error":
      return {
        reason: "backend_error",
        error_code: failure.error_code,
        message: failure.message,
        http_status: failure.http_status,
      };
  }
}

export interface ServiceUnavailableNavigationState {
  api_base_url?: string;
  details?: Record<string, string>;
  error_code: string;
  http_status?: number;
  message: string;
  reason: "database_unavailable" | "api_unreachable" | "backend_error";
}

function stringifyErrorDetails(
  raw: unknown
): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return;
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") {
      out[k] = v;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export async function evaluateInitialSetupGate(): Promise<InitialSetupGateResult> {
  const api_base_url = getApiBaseUrl();
  const url = `${api_base_url}/api/users/setup/status`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Network request failed.";
    return {
      status: "api_unreachable",
      error_code: ENGENTY_SERVICE_ERROR_CODES.API_UNREACHABLE,
      message,
      api_base_url,
    };
  }

  const payload = await readResponseJsonLoose(response);

  if (response.status === 503) {
    const code = isApiError(payload)
      ? payload.error.code
      : getApiErrorCode(payload, "");
    if (code === ENGENTY_SERVICE_ERROR_CODES.DB_UNAVAILABLE) {
      const details = stringifyErrorDetails(
        isApiError(payload) ? payload.error.details : undefined
      );
      return {
        status: "database_unavailable",
        error_code: ENGENTY_SERVICE_ERROR_CODES.DB_UNAVAILABLE,
        message: isApiError(payload)
          ? payload.error.message
          : "Database is not reachable.",
        ...(details ? { details } : {}),
      };
    }
  }

  if (!response.ok) {
    const message = isApiError(payload)
      ? payload.error.message
      : typeof payload === "string" && payload
        ? payload
        : `Request failed with status ${response.status}`;
    return {
      status: "backend_error",
      error_code: ENGENTY_SERVICE_ERROR_CODES.SETUP_BACKEND_ERROR,
      message,
      http_status: response.status,
    };
  }

  const body = payload as {
    data?: { initialSetupRequired?: boolean };
    initialSetupRequired?: boolean;
  };
  const initial_setup_required = Boolean(
    body.data?.initialSetupRequired ?? body.initialSetupRequired
  );

  return { status: "ready", initial_setup_required };
}

export function errorIfDatabaseUnavailableFromResponse(
  response: Response,
  payload: unknown
): EngentyServiceAvailabilityError | null {
  if (response.status !== 503) {
    return null;
  }
  const code = isApiError(payload)
    ? payload.error.code
    : getApiErrorCode(payload, "");
  if (code !== ENGENTY_SERVICE_ERROR_CODES.DB_UNAVAILABLE) {
    return null;
  }
  const rawDetails = isApiError(payload) ? payload.error.details : undefined;
  const details = stringifyErrorDetails(rawDetails);
  return new EngentyServiceAvailabilityError({
    status: "database_unavailable",
    error_code: ENGENTY_SERVICE_ERROR_CODES.DB_UNAVAILABLE,
    message: isApiError(payload)
      ? payload.error.message
      : "Database is not reachable.",
    ...(details ? { details } : {}),
  });
}
