import type {
  ActionInvoke,
  ImportedConnectorRecord,
  StoredAuthConfig,
} from "../types.js";

/**
 * Execute an imported HTTP action: substitute path params, place query/header
 * params, serialize the JSON body, inject credentials per the stored auth
 * config, and clamp the response for model context. Deliberately small and
 * fetch-based — the executor request pipeline stays confined to import time.
 */

/** Response clamp: tool output feeds model context; oversize bodies truncate. */
export const MAX_RESPONSE_CHARS = 200_000;

const REQUEST_TIMEOUT_MS = 30_000;

export class ExternalActionError extends Error {
  readonly body: string | null;
  readonly status: number | null;

  constructor(message: string, status: number | null, body: string | null) {
    super(message);
    this.name = "ExternalActionError";
    this.status = status;
    this.body = body;
  }
}

function renderTemplate(
  template: string,
  credentials: Record<string, string>
): string {
  return template.replace(
    /\{\{\s*([a-z0-9_]+)\s*\}\}/giu,
    (_m, key: string) => credentials[key] ?? ""
  );
}

/** Credential placement per auth kind; oauth2 bearer uses the fresh token. */
function applyAuth(params: {
  accessToken: string;
  auth: StoredAuthConfig;
  headers: Headers;
  url: URL;
}): void {
  const { accessToken, auth, headers, url } = params;
  if (auth.kind === "oauth2") {
    headers.set("authorization", `Bearer ${accessToken}`);
    return;
  }
  if (auth.kind === "api_key") {
    let credentials: Record<string, string> = {};
    try {
      credentials = JSON.parse(accessToken) as Record<string, string>;
    } catch {
      throw new ExternalActionError(
        "stored credentials are not valid JSON — reconnect the connection",
        null,
        null
      );
    }
    const value = renderTemplate(auth.placement.value_template, credentials);
    if (auth.placement.in === "query") {
      url.searchParams.set(auth.placement.name, value);
    } else {
      headers.set(auth.placement.name, value);
    }
  }
}

export interface BuiltHttpRequest {
  body: string | undefined;
  headers: Headers;
  method: string;
  url: URL;
}

export function buildHttpRequest(params: {
  accessToken: string;
  auth: StoredAuthConfig;
  baseUrl: string;
  input: Record<string, unknown>;
  invoke: Extract<ActionInvoke, { kind: "http" }>;
}): BuiltHttpRequest {
  const { accessToken, auth, baseUrl, input, invoke } = params;

  let path = invoke.path_template;
  const headers = new Headers({ accept: "application/json" });
  const query: [string, unknown][] = [];

  for (const param of invoke.params) {
    const value = input[param.name];
    if (value === undefined || value === null) {
      if (param.required && param.location === "path") {
        throw new ExternalActionError(
          `missing required path parameter "${param.name}"`,
          null,
          null
        );
      }
      continue;
    }
    if (param.location === "path") {
      path = path.replaceAll(
        `{${param.name}}`,
        encodeURIComponent(String(value))
      );
    } else if (param.location === "query") {
      query.push([param.name, value]);
    } else if (param.location === "header") {
      headers.set(param.name, String(value));
    }
    // cookie params are unsupported in v1 — ignored by design.
  }

  const url = new URL(baseUrl.replace(/\/+$/u, "") + path);
  for (const [name, value] of query) {
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(name, String(item));
      }
    } else {
      url.searchParams.append(name, String(value));
    }
  }

  let body: string | undefined;
  if (invoke.body_content_type && input.body !== undefined) {
    headers.set("content-type", invoke.body_content_type);
    body =
      invoke.body_content_type.includes("json") ||
      typeof input.body !== "string"
        ? JSON.stringify(input.body)
        : input.body;
  }

  applyAuth({ accessToken, auth, headers, url });
  return { body, headers, method: invoke.method.toUpperCase(), url };
}

export async function executeHttpAction(params: {
  accessToken: string;
  fetchImpl: typeof fetch;
  input: Record<string, unknown>;
  invoke: Extract<ActionInvoke, { kind: "http" }>;
  record: Pick<ImportedConnectorRecord, "auth_config" | "base_url">;
}): Promise<unknown> {
  const { accessToken, fetchImpl, input, invoke, record } = params;
  if (!record.base_url) {
    throw new ExternalActionError(
      "imported connector has no base URL — set one via refresh/import",
      null,
      null
    );
  }
  const request = buildHttpRequest({
    accessToken,
    auth: record.auth_config,
    baseUrl: record.base_url,
    input,
    invoke,
  });
  const response = await fetchImpl(request.url, {
    body: request.body,
    headers: request.headers,
    method: request.method,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new ExternalActionError(
      `provider request failed (${response.status} ${request.method} ${request.url.pathname})`,
      response.status,
      text.slice(0, 2000)
    );
  }
  const truncated = text.length > MAX_RESPONSE_CHARS;
  const clamped = truncated ? text.slice(0, MAX_RESPONSE_CHARS) : text;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("json")) {
    try {
      return truncated
        ? { body: clamped, truncated: true }
        : JSON.parse(clamped);
    } catch {
      return { body: clamped, truncated };
    }
  }
  return { body: clamped, content_type: contentType || null, truncated };
}
