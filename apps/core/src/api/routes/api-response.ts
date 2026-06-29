import {
  createApiError,
  createApiSuccess,
  isApiError,
  isApiSuccess,
  normalizeSuccessPayload,
} from "@engenty/api-contracts";

interface JsonContext {
  json: (body: unknown, status?: number) => Response;
}

interface JsonErrorOptions {
  code?: string;
  details?: unknown;
  fields?: Record<string, string[]>;
  message: string;
}

export function statusToErrorCode(status: number) {
  switch (status) {
    case 400:
      return "bad_request";
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 409:
      return "conflict";
    case 422:
      return "validation_error";
    case 429:
      return "rate_limited";
    case 500:
      return "internal_error";
    case 501:
      return "not_implemented";
    case 503:
      return "service_unavailable";
    default:
      return status >= 500 ? "internal_error" : "request_failed";
  }
}

export function buildJsonErrorBody(
  status: number,
  { code, details, fields, message }: JsonErrorOptions
) {
  return createApiError({
    code: code ?? statusToErrorCode(status),
    message,
    ...(details === undefined ? {} : { details }),
    ...(fields === undefined ? {} : { fields }),
  });
}

export function jsonApiError(
  c: JsonContext,
  status: number,
  options: JsonErrorOptions
) {
  return c.json(buildJsonErrorBody(status, options), status);
}

export function jsonApiSuccess(
  c: JsonContext,
  value: unknown,
  options: {
    meta?: unknown;
    normalize?: boolean;
    status?: number;
  } = {}
) {
  const { meta, normalize = true, status = 200 } = options;
  const body = (() => {
    if (isApiSuccess(value) || isApiError(value)) {
      return value;
    }
    if (!normalize) {
      return createApiSuccess(value, meta);
    }
    if (meta !== undefined) {
      return createApiSuccess(value, meta);
    }
    return normalizeSuccessPayload(value);
  })();
  return c.json(body, status);
}

export function parseLegacyErrorBody(status: number, value: unknown) {
  if (isApiError(value)) {
    return value;
  }

  if (typeof value === "string") {
    return buildJsonErrorBody(status, { message: value });
  }

  if (!(typeof value === "object" && value !== null)) {
    return buildJsonErrorBody(status, {
      message: `Request failed with status ${status}`,
    });
  }

  const candidate = value as {
    approvalRequestId?: unknown;
    debug?: unknown;
    details?: unknown;
    error?: unknown;
    fields?: unknown;
    fix?: unknown;
    message?: unknown;
    reason?: unknown;
    status?: unknown;
    why?: unknown;
  };

  const details =
    "details" in candidate ||
    "reason" in candidate ||
    "approvalRequestId" in candidate ||
    "debug" in candidate ||
    "why" in candidate ||
    "fix" in candidate
      ? {
          ...(candidate.details === undefined
            ? {}
            : { details: candidate.details }),
          ...(candidate.reason === undefined
            ? {}
            : { reason: candidate.reason }),
          ...(candidate.approvalRequestId === undefined
            ? {}
            : { approvalRequestId: candidate.approvalRequestId }),
          ...(candidate.debug === undefined ? {} : { debug: candidate.debug }),
          ...(candidate.why === undefined ? {} : { why: candidate.why }),
          ...(candidate.fix === undefined ? {} : { fix: candidate.fix }),
        }
      : undefined;

  const fields =
    typeof candidate.fields === "object" && candidate.fields !== null
      ? (candidate.fields as Record<string, string[]>)
      : undefined;

  const code =
    typeof candidate.status === "string"
      ? candidate.status
      : candidate.reason === "approval_required"
        ? "approval_required"
        : undefined;

  const message =
    typeof candidate.error === "string"
      ? candidate.error
      : typeof candidate.message === "string"
        ? candidate.message
        : typeof candidate.reason === "string"
          ? candidate.reason
          : `Request failed with status ${status}`;

  return buildJsonErrorBody(status, {
    code,
    message,
    details,
    fields,
  });
}
