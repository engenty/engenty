/**
 * Heuristic: distinguish transport / upstream outages from validation or SQL errors.
 * Unknown errors return false so callers can surface 500 instead of masking as 503.
 */
export function isLikelySupabaseConnectivityFailure(error: unknown): boolean {
  if (error instanceof TypeError) {
    const m = error.message.toLowerCase();
    return m.includes("fetch") || m.includes("network");
  }

  if (typeof error !== "object" || error === null) {
    return false;
  }

  const e = error as {
    code?: unknown;
    message?: unknown;
    cause?: unknown;
  };

  const msg = String(e.message ?? "").toLowerCase();
  if (
    /econnrefused|etimedout|enotfound|socket hang up|fetch failed|network error|getaddrinfo|connection refused|connect timeout|und_err_connect/i.test(
      msg
    )
  ) {
    return true;
  }
  if (msg.includes("schema cache")) {
    return true;
  }

  if (e.cause) {
    return isLikelySupabaseConnectivityFailure(e.cause);
  }

  const code = String(e.code ?? "");
  if (
    code === "PGRST000" ||
    code === "PGRST002" ||
    code === "PGRST202" ||
    code === "PGRST301"
  ) {
    return true;
  }

  return false;
}
