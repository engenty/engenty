import type {
  ConnectorAction,
  ConnectorActionContext,
  ConnectorActionGroup,
  ConnectorOAuth2Config,
} from "@engenty/connections-sdk";
import type { z } from "zod";

/**
 * Shared Google OAuth2 config for all three connectors. One OAuth client
 * (GOOGLE_OAUTH_CLIENT_ID/SECRET) covers Gmail, Drive and Calendar; scopes are
 * requested incrementally per enabled action group
 * (`include_granted_scopes=true`).
 */
export const GOOGLE_OAUTH2: ConnectorOAuth2Config = {
  authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  baseScopes: ["openid", "email"],
  clientIdEnv: "GOOGLE_OAUTH_CLIENT_ID",
  clientSecretEnv: "GOOGLE_OAUTH_CLIENT_SECRET",
  extraAuthParams: {
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
  },
  resolveAccount: async (accessToken, fetchImpl) => {
    const res = await fetchImpl("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(
        `google_api_error (${res.status}): ${await errorExcerpt(res)}`
      );
    }
    const data = (await res.json()) as { email?: string; id?: string };
    return {
      ...(data.id ? { externalId: data.id } : {}),
      label: data.email ?? "Google account",
    };
  },
  tokenUrl: "https://oauth2.googleapis.com/token",
};

async function errorExcerpt(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  return body.replace(/\s+/g, " ").trim().slice(0, 200) || res.statusText;
}

/**
 * Bearer-authenticated fetch against a Google API. Throws
 * `google_api_error (<status>): <short body excerpt>` on non-2xx responses.
 */
export async function googleFetch(
  ctx: ConnectorActionContext,
  url: string,
  init?: RequestInit
): Promise<Response> {
  const res = await ctx.fetchImpl(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
      ...((init?.headers as Record<string, string> | undefined) ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`google_api_error (${res.status}): ${await errorExcerpt(res)}`);
  }
  return res;
}

/** googleFetch + JSON body. */
export async function googleJson<T>(
  ctx: ConnectorActionContext,
  url: string,
  init?: RequestInit
): Promise<T> {
  const res = await googleFetch(ctx, url, init);
  return (await res.json()) as T;
}

/**
 * Build a `ConnectorAction` whose handler receives zod-parsed, typed input.
 * The runtime hands the raw operation input straight to the handler, so each
 * action validates against its own inputSchema before touching the provider.
 */
export function connectorAction<S extends z.ZodType>(def: {
  description: string;
  group: ConnectorActionGroup;
  handler: (
    input: z.output<S>,
    ctx: ConnectorActionContext
  ) => Promise<unknown>;
  id: string;
  inputSchema: S;
  providerScopes: string[];
  summary: string;
}): ConnectorAction {
  return {
    description: def.description,
    group: def.group,
    handler: (input, ctx) =>
      def.handler(def.inputSchema.parse(input) as z.output<S>, ctx),
    id: def.id,
    inputSchema: def.inputSchema,
    providerScopes: def.providerScopes,
    summary: def.summary,
  };
}
