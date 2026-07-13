import type {
  SatelliteEndpoints,
  SatelliteHealth,
  SatelliteHealthStatus,
} from "./satellites.js";

/**
 * Map a probe outcome to a health status. Pure so the policy is testable
 * without network. Unreachable → down; 2xx/3xx → healthy; 5xx → degraded;
 * other (4xx) → degraded (reachable but not serving OK).
 */
export function classifyHealth(
  reachable: boolean,
  httpStatus?: number
): SatelliteHealthStatus {
  if (!reachable) {
    return "down";
  }
  if (httpStatus !== undefined && httpStatus >= 200 && httpStatus < 400) {
    return "healthy";
  }
  return "degraded";
}

/**
 * Probe a satellite's API endpoint and return a health record. Best-effort:
 * network errors resolve to `down`, never throw. `fetchImpl` is injectable for
 * tests; `now` supplies the timestamp.
 */
export async function probeSatellite(
  endpoints: SatelliteEndpoints,
  opts: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    now?: () => Date;
  } = {}
): Promise<SatelliteHealth> {
  const now = (opts.now ?? (() => new Date()))().toISOString();
  const apiUrl = endpoints.apiUrl;
  if (!apiUrl) {
    return {
      status: "unknown",
      checkedAt: now,
      detail: "No apiUrl configured",
    };
  }
  const fetchImpl = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 5000);
  try {
    const res = await fetchImpl(`${apiUrl.replace(/\/$/, "")}/api/health`, {
      signal: controller.signal,
    });
    return {
      status: classifyHealth(true, res.status),
      checkedAt: now,
      detail: `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      status: "down",
      checkedAt: now,
      detail: err instanceof Error ? err.message : "unreachable",
    };
  } finally {
    clearTimeout(timeout);
  }
}
