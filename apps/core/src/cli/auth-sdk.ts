import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface StoredAuthSession {
  accessToken: string;
  apiUrl: string;
  expiresAt?: number;
  refreshToken?: string;
  sessionId?: string;
}

const AUTH_DIR = path.join(os.homedir(), ".engenty");
const AUTH_FILE = path.join(AUTH_DIR, "auth.json");

/** Absolute path where `engenty auth login` stores the access token. */
export const CLI_AUTH_SESSION_FILE = AUTH_FILE;

function readSessionFromDisk(): StoredAuthSession | null {
  try {
    if (!fs.existsSync(AUTH_FILE)) {
      return null;
    }
    const raw = fs.readFileSync(AUTH_FILE, "utf8");
    const parsed = JSON.parse(raw) as StoredAuthSession;
    if (!(parsed?.apiUrl && parsed?.accessToken)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeSessionToDisk(session: StoredAuthSession): void {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(AUTH_FILE, JSON.stringify(session, null, 2), "utf8");
}

/** Persist a session obtained outside the device flow (e.g. dev login). */
export function storeSession(session: StoredAuthSession): void {
  writeSessionToDisk(session);
}

export function clearStoredSession(): void {
  if (fs.existsSync(AUTH_FILE)) {
    fs.unlinkSync(AUTH_FILE);
  }
}

export function getStoredSession(apiUrl?: string): StoredAuthSession | null {
  const session = readSessionFromDisk();
  if (!session) {
    return null;
  }
  if (apiUrl && session.apiUrl !== apiUrl) {
    return null;
  }
  return session;
}

/** Non-interactive auth for agents/CI: takes precedence over the stored session. */
export const CLI_TOKEN_ENV_VAR = "ENGENTY_TOKEN";

export class CliApiError extends Error {
  readonly status: number;
  readonly body?: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "CliApiError";
    this.status = status;
    this.body = body;
  }
}

export interface DeviceAuthorizationStart {
  deviceCode: string;
  expiresIn: number;
  interval: number;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
}

/** Step 1 of the device flow: request a pending authorization (no identity). */
export async function startDeviceAuthorization(params: {
  apiUrl: string;
  capabilities?: string[];
  clientName?: string;
}): Promise<DeviceAuthorizationStart> {
  let response: Response;
  try {
    response = await fetch(`${params.apiUrl}/api/auth/device/authorize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        capabilities: params.capabilities ?? [],
        clientName: params.clientName,
      }),
    });
  } catch (err) {
    throw new CliApiError(
      `Cannot reach the API at ${params.apiUrl} (${err instanceof Error ? err.message : String(err)})`,
      0
    );
  }
  if (!response.ok) {
    throw new CliApiError(
      `Device authorization failed (${response.status}): ${await response.text()}`,
      response.status
    );
  }
  return (await response.json()) as DeviceAuthorizationStart;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Step 2: poll until a logged-in user approves the code in the web UI.
 * Resolves with the stored session; throws CliApiError on denial/expiry.
 */
export async function pollDeviceToken(params: {
  apiUrl: string;
  deviceCode: string;
  expiresIn: number;
  intervalSeconds: number;
  onPending?: () => void;
  sleepImpl?: (ms: number) => Promise<void>;
}): Promise<StoredAuthSession> {
  const wait = params.sleepImpl ?? sleep;
  const deadline = Date.now() + params.expiresIn * 1000;
  let intervalMs = Math.max(params.intervalSeconds, 1) * 1000;
  while (Date.now() < deadline) {
    const response = await fetch(`${params.apiUrl}/api/auth/device/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceCode: params.deviceCode }),
    });
    if (response.ok) {
      const payload = (await response.json()) as {
        accessToken: string;
        expiresIn?: number;
        refreshToken?: string;
        sessionId?: string;
      };
      const session: StoredAuthSession = {
        accessToken: payload.accessToken,
        apiUrl: params.apiUrl,
        expiresAt: payload.expiresIn
          ? Date.now() + payload.expiresIn * 1000
          : undefined,
        refreshToken: payload.refreshToken,
        sessionId: payload.sessionId,
      };
      writeSessionToDisk(session);
      return session;
    }
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (body.error === "authorization_pending") {
      params.onPending?.();
    } else if (body.error === "slow_down") {
      intervalMs += 5000;
    } else if (body.error === "access_denied") {
      throw new CliApiError("Login denied in the browser.", 400);
    } else {
      throw new CliApiError(
        `Device login failed: ${body.error ?? response.status}`,
        response.status
      );
    }
    await wait(intervalMs);
  }
  throw new CliApiError(
    "Device code expired — re-run engenty auth login.",
    400
  );
}

export async function ensureAccessToken(
  apiUrl: string,
  explicitToken?: string,
  forceRefresh = false
): Promise<string | undefined> {
  if (explicitToken) {
    return explicitToken;
  }
  const envToken = process.env[CLI_TOKEN_ENV_VAR]?.trim();
  if (envToken) {
    return envToken;
  }
  const stored = getStoredSession(apiUrl);
  if (!stored) {
    return;
  }
  const expiresSoon = stored.expiresAt
    ? stored.expiresAt - Date.now() < 45_000
    : false;
  if (!(expiresSoon || forceRefresh)) {
    return stored.accessToken;
  }
  if (!stored.refreshToken) {
    return stored.accessToken;
  }

  const exchange = await fetch(`${apiUrl}/api/auth/token/exchange`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken: stored.refreshToken }),
  });
  if (!exchange.ok) {
    return stored.accessToken;
  }
  const payload = (await exchange.json()) as {
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
    sessionId?: string;
  };
  const next: StoredAuthSession = {
    apiUrl,
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken ?? stored.refreshToken,
    expiresAt: payload.expiresIn
      ? Date.now() + payload.expiresIn * 1000
      : stored.expiresAt,
    sessionId: payload.sessionId ?? stored.sessionId,
  };
  writeSessionToDisk(next);
  return next.accessToken;
}

export async function authenticatedJsonRequest<T>(params: {
  acceptStatuses?: number[];
  apiUrl: string;
  endpoint: string;
  method: "GET" | "POST" | "DELETE";
  token?: string;
  body?: unknown;
}): Promise<T> {
  const token = await ensureAccessToken(params.apiUrl, params.token);
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  let response: Response;
  try {
    response = await fetch(`${params.apiUrl}${params.endpoint}`, {
      method: params.method,
      headers,
      body: params.body ? JSON.stringify(params.body) : undefined,
    });
  } catch (err) {
    throw new CliApiError(
      `Cannot reach the API at ${params.apiUrl} (${err instanceof Error ? err.message : String(err)})`,
      0
    );
  }
  if (response.status === 401 && !params.token) {
    const refreshed = await ensureAccessToken(params.apiUrl, undefined, true);
    if (refreshed) {
      const retryHeaders: Record<string, string> = {
        "content-type": "application/json",
        authorization: `Bearer ${refreshed}`,
      };
      const retry = await fetch(`${params.apiUrl}${params.endpoint}`, {
        method: params.method,
        headers: retryHeaders,
        body: params.body ? JSON.stringify(params.body) : undefined,
      });
      if (!(retry.ok || (params.acceptStatuses ?? []).includes(retry.status))) {
        throw await toApiError(retry);
      }
      return (await retry.json()) as T;
    }
  }
  if (
    !(response.ok || (params.acceptStatuses ?? []).includes(response.status))
  ) {
    throw await toApiError(response);
  }
  return (await response.json()) as T;
}

async function toApiError(response: Response): Promise<CliApiError> {
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = undefined;
  }
  return new CliApiError(
    `API ${response.status}: ${text || response.statusText}`,
    response.status,
    body
  );
}
