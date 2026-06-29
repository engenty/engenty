/**
 * Startup check: verify Supabase is reachable when SUPABASE_URL and key are set.
 * Logs a clear warning if Docker/Supabase is not running so devs see it on API start.
 */

const CHECK_TIMEOUT_MS = 5000;

export interface SupabaseReachabilityResult {
  message?: string;
  ok: boolean;
}

/**
 * Check that the Supabase instance at url is reachable (e.g. Docker is up).
 * Uses the REST API with the service role key; 200/204/404 are treated as "up".
 */
export async function checkSupabaseReachable(
  url: string,
  serviceRoleKey: string
): Promise<SupabaseReachabilityResult> {
  const base = url.replace(/\/$/, "");
  const restUrl = `${base}/rest/v1/`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(restUrl, {
      method: "HEAD",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    // 200/204 = OK; 404 = Supabase up but no table (still reachable)
    if (res.status === 200 || res.status === 204 || res.status === 404) {
      return { ok: true };
    }
    return {
      ok: false,
      message: `HTTP ${res.status}`,
    };
  } catch (err) {
    clearTimeout(timeout);
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      message: message.includes("abort")
        ? "Connection timed out (is Supabase running?)"
        : message,
    };
  }
}
