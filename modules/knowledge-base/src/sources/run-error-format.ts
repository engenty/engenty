const MAX_RUN_ERROR_CHARS = 12_000;

export function formatRunError(error: unknown): string {
  if (
    typeof AggregateError !== "undefined" &&
    error instanceof AggregateError
  ) {
    const parts = error.errors.map((e) =>
      e instanceof Error ? e.message.trim() : String(e)
    );
    const joined = parts.filter(Boolean).join("; ");
    const base = error.message.trim();
    if (joined) {
      return joined;
    }
    if (base) {
      return base;
    }
    return "AggregateError";
  }
  if (error instanceof Error) {
    let msg = error.message.trim();
    if (!msg) {
      msg = error.name;
    }
    if (error.cause !== undefined) {
      const cause = formatRunError(error.cause);
      if (cause) {
        msg = `${msg} — ${cause}`;
      }
    }
    return msg || "Error";
  }
  if (typeof error === "string") {
    return error;
  }
  if (typeof error === "number" || typeof error === "boolean") {
    return String(error);
  }
  if (error === null || error === undefined) {
    return "";
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function truncateRunError(message: string): string {
  if (message.length <= MAX_RUN_ERROR_CHARS) {
    return message;
  }
  return `${message.slice(0, MAX_RUN_ERROR_CHARS)}…`;
}

export function failureMetadataFromError(
  error: unknown
): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  if (
    typeof AggregateError !== "undefined" &&
    error instanceof AggregateError
  ) {
    meta.aggregate_error_count = error.errors.length;
  }
  if (error instanceof Error) {
    meta.error_name = error.name;
  }
  return meta;
}
