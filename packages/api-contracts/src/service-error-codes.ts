/**
 * Stable operator-facing error codes returned in API `error.code` and surfaced in UI.
 *
 * Codes are numeric strings so admins / harness can look them up as plain numbers
 * (e.g. "Error code: 50001"). Wire format stays `string` to keep `apiErrorShapeSchema`
 * compatible with existing validation and other non-numeric error codes
 * (e.g. "validation_error").
 *
 * Allocation scheme (5 digits):
 *   5xxxx -- service availability / infrastructure (HTTP 5xx family)
 *     50001  Database unavailable / unreachable
 *     50002  API host unreachable from the client
 *     50003  Generic backend error during startup checks
 *
 * Reserve future ranges as needed:
 *   4xxxx -- client / request errors
 *   6xxxx -- auth / permission
 *   9xxxx -- experimental / unallocated
 *
 * Once shipped, never reuse a number for a different meaning. Add a new code instead.
 */
export const ENGENTY_SERVICE_ERROR_CODES = {
  DB_UNAVAILABLE: "50001",
  API_UNREACHABLE: "50002",
  SETUP_BACKEND_ERROR: "50003",
} as const;

export type EngentyServiceErrorCode =
  (typeof ENGENTY_SERVICE_ERROR_CODES)[keyof typeof ENGENTY_SERVICE_ERROR_CODES];
