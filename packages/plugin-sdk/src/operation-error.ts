/**
 * A handler error that is an ANSWER, not a crash.
 *
 * Module operation handlers signal failure by throwing, and core's invoke path
 * translates anything it does not recognise into 500 `internal_error`. That is
 * right for a genuine fault and wrong for the common case: "no such
 * connection", "not yours to change", "already in that state" are things the
 * caller did, and a 500 tells them — and every retry policy, alert and log
 * dashboard between here and there — that the server broke instead.
 *
 * Throw this when the handler knows the status. Core reads `status` and `code`
 * off it; everything else keeps the existing behaviour, so no module has to
 * change to keep working.
 *
 * Keep `status` in the 4xx range. A 5xx here would be indistinguishable from
 * the untyped throw it exists to replace.
 */
export class PluginOperationError extends Error {
  /**
   * Structural marker, because `instanceof` is not reliable across the seam
   * this crosses: modules are loaded through jiti and can end up holding a
   * different copy of plugin-sdk than core imports, so the prototype chains
   * do not meet. A thrown error that "is" this class but fails `instanceof`
   * would fall through to 500 — the exact bug this class exists to fix, hidden
   * behind a check that looks correct.
   */
  readonly isPluginOperationError = true as const;

  /** Stable machine-readable code, e.g. `connection_not_found`. */
  readonly code: string;
  /** Extra detail for the client; omitted from the response when empty. */
  readonly details?: Record<string, unknown>;
  /** HTTP status the caller should see. */
  readonly status: number;

  constructor(
    code: string,
    message: string,
    options: { details?: Record<string, unknown>; status?: number } = {}
  ) {
    super(message);
    this.name = "PluginOperationError";
    this.code = code;
    this.status = options.status ?? 400;
    if (options.details) {
      this.details = options.details;
    }
  }
}

/**
 * Whether a caught value is a {@link PluginOperationError}, checked
 * structurally — see the marker's note on why `instanceof` is not enough here.
 */
export function isPluginOperationError(
  value: unknown
): value is PluginOperationError {
  return (
    value instanceof Error &&
    (value as Partial<PluginOperationError>).isPluginOperationError === true &&
    typeof (value as Partial<PluginOperationError>).code === "string" &&
    typeof (value as Partial<PluginOperationError>).status === "number"
  );
}

/** 404 — the thing named does not exist, or the caller may not see it. */
export function notFoundError(
  code: string,
  message: string,
  details?: Record<string, unknown>
): PluginOperationError {
  return new PluginOperationError(code, message, {
    status: 404,
    ...(details ? { details } : {}),
  });
}

/** 403 — it exists, and this caller may not do that to it. */
export function forbiddenError(
  code: string,
  message: string,
  details?: Record<string, unknown>
): PluginOperationError {
  return new PluginOperationError(code, message, {
    status: 403,
    ...(details ? { details } : {}),
  });
}
