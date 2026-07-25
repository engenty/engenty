/**
 * Thin client for apps/app-host.
 *
 * app-host is internal-only: no published port, no gateway target, reachable
 * only over the internal Docker network. It runs tenant-authored code, so the
 * only thing that ever talks to it is this client, with a shared secret.
 */

export interface AppHostDeployment {
  appId: string;
  namespace: string;
  pool: string;
  regions: string[];
  release: string;
}

export interface AppHostBuildFailure {
  buildLog: string;
  code: string;
  message: string;
}

export class AppHostBuildError extends Error {
  readonly detail: AppHostBuildFailure;

  constructor(detail: AppHostBuildFailure) {
    super(detail.message);
    this.name = "AppHostBuildError";
    this.detail = detail;
  }
}

export class AppHostUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppHostUnavailableError";
  }
}

export interface AppHostGuestResponse {
  body: string;
  headers: Record<string, string>;
  status: number;
}

export interface AppHostClient {
  deploy(
    appId: string,
    files: Record<string, string>
  ): Promise<AppHostDeployment>;
  destroy(appId: string): Promise<void>;
  request(
    appId: string,
    req: {
      body?: string;
      headers?: Record<string, string>;
      method: string;
      path: string;
    }
  ): Promise<AppHostGuestResponse>;
}

export interface AppHostClientOptions {
  baseUrl: string;
  /** Milliseconds. Builds are slow — a cold agentOS build VM takes ~20-30s. */
  deployTimeoutMs?: number;
  requestTimeoutMs?: number;
  token: string | null;
}

/**
 * Compose a routing id for the app host. The tenant prefix keeps two tenants
 * that both created an app with the same local id from colliding on a single
 * shared host, and the shape satisfies app-host's own id validation.
 */
export function appHostId(tenantId: string, appId: string): string {
  const normalize = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `t-${normalize(tenantId).slice(0, 32)}-a-${normalize(appId).slice(0, 32)}`;
}

export function createAppHostClient(
  options: AppHostClientOptions
): AppHostClient {
  const base = options.baseUrl.replace(/\/$/, "");
  const deployTimeoutMs = options.deployTimeoutMs ?? 180_000;
  const requestTimeoutMs = options.requestTimeoutMs ?? 30_000;

  const headers = (): Record<string, string> => {
    const out: Record<string, string> = { "content-type": "application/json" };
    if (options.token) {
      out.authorization = `Bearer ${options.token}`;
    }
    return out;
  };

  const call = async (
    path: string,
    init: { body?: unknown; method: string },
    timeoutMs: number
  ): Promise<{ payload: unknown; status: number }> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${base}${path}`, {
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        headers: headers(),
        method: init.method,
        signal: controller.signal,
      });
      const text = await response.text();
      let payload: unknown = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = { raw: text };
      }
      return { payload, status: response.status };
    } catch (error) {
      throw new AppHostUnavailableError(
        `app host unreachable at ${base}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      clearTimeout(timer);
    }
  };

  return {
    async deploy(appId, files) {
      const { payload, status } = await call(
        `/internal/apps/${encodeURIComponent(appId)}/deploy`,
        { body: { files }, method: "POST" },
        deployTimeoutMs
      );
      if (status === 422) {
        const detail = payload as Partial<AppHostBuildFailure> | null;
        throw new AppHostBuildError({
          buildLog: detail?.buildLog ?? "build failed without output",
          code: detail?.code ?? "app_build_failed",
          message: detail?.message ?? "build failed",
        });
      }
      if (status !== 200) {
        throw new AppHostUnavailableError(
          `app host deploy failed (${status}): ${JSON.stringify(payload)}`
        );
      }
      return (payload as { deployment: AppHostDeployment }).deployment;
    },

    async destroy(appId) {
      const { status, payload } = await call(
        `/internal/apps/${encodeURIComponent(appId)}`,
        { method: "DELETE" },
        deployTimeoutMs
      );
      if (status !== 200) {
        throw new AppHostUnavailableError(
          `app host destroy failed (${status}): ${JSON.stringify(payload)}`
        );
      }
    },

    async request(appId, req) {
      const { payload, status } = await call(
        `/internal/apps/${encodeURIComponent(appId)}/request`,
        { body: req, method: "POST" },
        requestTimeoutMs
      );
      if (status !== 200) {
        throw new AppHostUnavailableError(
          `app host request failed (${status}): ${JSON.stringify(payload)}`
        );
      }
      return (payload as { response: AppHostGuestResponse }).response;
    },
  };
}
