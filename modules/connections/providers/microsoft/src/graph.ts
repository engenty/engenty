import type {
  ConnectorActionContext,
  ConnectorOAuth2Config,
} from "@engenty/connections-sdk";

export const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

/**
 * Shared Microsoft identity platform OAuth config (tenant `common`, so both
 * org and personal Microsoft accounts can connect). Both connectors reuse it;
 * per-action `providerScopes` add the Graph delegated permissions on top of
 * these base identity scopes.
 */
export const MICROSOFT_OAUTH2: ConnectorOAuth2Config = {
  authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
  baseScopes: ["openid", "email", "offline_access", "User.Read"],
  clientIdEnv: "MICROSOFT_OAUTH_CLIENT_ID",
  clientSecretEnv: "MICROSOFT_OAUTH_CLIENT_SECRET",
  resolveAccount: async (accessToken, fetchImpl) => {
    const res = await fetchImpl(`${GRAPH_BASE_URL}/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(
        `microsoft_graph_error (${res.status}): failed to resolve account via /me`
      );
    }
    const me = (await res.json()) as {
      id?: string;
      mail?: string | null;
      userPrincipalName?: string | null;
    };
    return {
      externalId: me.id,
      label: me.userPrincipalName ?? me.mail ?? "Microsoft account",
    };
  },
  tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
};

async function graphError(res: Response): Promise<Error> {
  let excerpt = "";
  try {
    excerpt = (await res.text()).replace(/\s+/g, " ").trim().slice(0, 300);
  } catch {
    // ignore body read failures — status alone is enough
  }
  return new Error(
    `microsoft_graph_error (${res.status}): ${excerpt || res.statusText}`
  );
}

/**
 * JSON request against Microsoft Graph. `path` is relative to the v1.0 base
 * (must start with `/`). Returns the parsed JSON body, or `null` for
 * 202/204-style empty responses.
 */
export async function graphJson<T = unknown>(
  ctx: ConnectorActionContext,
  path: string,
  init?: { body?: unknown; method?: string }
): Promise<T> {
  const res = await ctx.fetchImpl(`${GRAPH_BASE_URL}${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${ctx.accessToken}`,
      ...(init?.body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
    },
    method: init?.method ?? "GET",
    ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  if (!res.ok) {
    throw await graphError(res);
  }
  if (
    res.status === 204 ||
    res.status === 202 ||
    res.headers.get("content-length") === "0"
  ) {
    return null as T;
  }
  const text = await res.text();
  if (!text) {
    return null as T;
  }
  return JSON.parse(text) as T;
}

/** Raw (non-JSON) Graph request — used for file content and uploads. */
export async function graphRaw(
  ctx: ConnectorActionContext,
  path: string,
  init?: { body?: string; contentType?: string; method?: string }
): Promise<Response> {
  const res = await ctx.fetchImpl(`${GRAPH_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
      ...(init?.contentType ? { "Content-Type": init.contentType } : {}),
    },
    method: init?.method ?? "GET",
    ...(init?.body === undefined ? {} : { body: init.body }),
  });
  if (!res.ok) {
    throw await graphError(res);
  }
  return res;
}

/** Very small HTML → plain-text conversion for message/event bodies. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|blockquote|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Body from a Graph message/event `itemBody`, normalized to plain text. */
export function bodyToText(
  body:
    | { content?: string | null; contentType?: string | null }
    | null
    | undefined
): string {
  const content = body?.content ?? "";
  if (!content) {
    return "";
  }
  return body?.contentType?.toLowerCase() === "html"
    ? htmlToText(content)
    : content;
}
