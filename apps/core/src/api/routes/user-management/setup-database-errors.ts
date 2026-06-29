import { ENGENTY_SERVICE_ERROR_CODES } from "@engenty/api-contracts";
import { createLogger } from "@engenty/telemetry";
import { AuthVerificationError } from "../../../dal/core-users/auth.js";
import { buildPublicDatabaseFailureDetails } from "../../../lib/database-failure-public-details.js";
import { isLikelySupabaseConnectivityFailure } from "../../../lib/supabase-connectivity-error.js";
import { jsonApiError, jsonApiSuccess } from "../api-response.js";

const logger = createLogger({ name: "user-management-setup-db" });

interface JsonContext {
  json: (body: unknown, status?: number) => Response;
}

export function authVerificationFailureResponse(
  c: JsonContext,
  error: unknown
): Response | null {
  if (!(error instanceof AuthVerificationError)) {
    return null;
  }
  return jsonApiError(c, 401, { message: error.message });
}

export function connectivityFailureResponse(
  c: JsonContext,
  config: Record<string, unknown>,
  error: unknown
): Response | null {
  if (!isLikelySupabaseConnectivityFailure(error)) {
    return null;
  }
  logger.warn("supabase_connectivity_failure", {
    err: error instanceof Error ? error.message : String(error),
  });
  return jsonApiError(c, 503, {
    code: ENGENTY_SERVICE_ERROR_CODES.DB_UNAVAILABLE,
    message: "Database is not reachable.",
    details: buildPublicDatabaseFailureDetails(config, error),
  });
}

export async function jsonApiSuccessOrDatabaseDown<T>(
  c: JsonContext,
  config: Record<string, unknown>,
  run: () => Promise<T>
): Promise<Response> {
  try {
    const data = await run();
    return jsonApiSuccess(c, data);
  } catch (error) {
    const unauthorized = authVerificationFailureResponse(c, error);
    if (unauthorized) {
      return unauthorized;
    }
    const down = connectivityFailureResponse(c, config, error);
    if (down) {
      return down;
    }
    throw error;
  }
}

export function isPostgresUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    String((error as { code?: unknown }).code) === "23505"
  );
}

export async function jsonApiSuccessCreateInitialAdmin<T>(
  c: JsonContext,
  config: Record<string, unknown>,
  run: () => Promise<T>,
  uniqueViolationMessage = "A user record already exists for this account."
): Promise<Response> {
  try {
    const data = await run();
    return jsonApiSuccess(c, data);
  } catch (error) {
    if (isPostgresUniqueViolation(error)) {
      logger.warn("user_setup_unique_violation", {
        err: error instanceof Error ? error.message : JSON.stringify(error),
      });
      return jsonApiError(c, 409, { message: uniqueViolationMessage });
    }
    const unauthorized = authVerificationFailureResponse(c, error);
    if (unauthorized) {
      return unauthorized;
    }
    const down = connectivityFailureResponse(c, config, error);
    if (down) {
      return down;
    }
    throw error;
  }
}
