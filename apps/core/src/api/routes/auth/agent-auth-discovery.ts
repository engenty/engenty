import type { OpenAPIHono } from "@hono/zod-openapi";

/** Resolve the public origin (gateway host) for absolute URLs in discovery docs. */
export function resolveOrigin(req: {
  header: (name: string) => string | undefined;
}): string {
  const forwardedHost = req.header("x-forwarded-host");
  if (forwardedHost) {
    return `${req.header("x-forwarded-proto") ?? "https"}://${forwardedHost}`;
  }
  const configured =
    process.env.PUBLIC_APP_URL ?? process.env.ENGENTY_UI_BASE_URL ?? "";
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  const host = req.header("host") ?? "127.0.0.1:8787";
  return `http://${host}`;
}

export function buildAuthMdManifest(origin: string): string {
  return `# auth.md — how agents authenticate with Engenty

> Open agent-auth manifest (https://github.com/workos/auth.md).
> Engenty supports the **User-Claimed** flow (RFC 8628 claim ceremony) and
> long-lived **API keys**. Agent-Verified (ID-JAG) is not supported: every
> credential is approved by a human and clamped to that human's permissions.

## Flow 1: User-Claimed claim ceremony (interactive)

1. \`POST ${origin}/api/auth/device/authorize\` (also \`${origin}/oauth2/device_authorization\`)
   with optional JSON \`{"capabilities": [...], "clientName": "..."}\`.
   Response: \`device_code\`, \`user_code\`, \`verification_uri\`,
   \`verification_uri_complete\`, \`expires_in\`, \`interval\`.
2. Show the \`user_code\` to the user and send them to
   \`${origin}/auth/device\` (they approve while logged in; the granted
   capabilities are clamped to their role).
3. Poll \`POST ${origin}/api/auth/device/token\` (also \`${origin}/oauth2/token\`
   with \`grant_type=urn:ietf:params:oauth:grant-type:device_code\`) every
   \`interval\` seconds. Errors per RFC 8628: \`authorization_pending\`,
   \`slow_down\`, \`access_denied\`, \`expired_token\`.
4. Success returns \`access_token\` (Bearer, 15 min) + \`refresh_token\` (14 d,
   rotate via \`POST ${origin}/api/auth/token/exchange\`).

## Flow 2: API key (non-interactive agents / CI)

A logged-in human mints a key — capabilities are clamped to their own:
\`engenty auth tokens create --name <agent> --capabilities module.read\`
(or \`POST ${origin}/api/auth/api-tokens\`). Use it as
\`Authorization: Bearer <token>\` or via the \`ENGENTY_TOKEN\` env var with the
\`engenty\` CLI. Keys are revocable at any time.

## Scopes / capabilities

Capabilities gate module operations (tools), e.g. \`module.read\`,
\`module.invoices.write\`, \`core.superadmin\`. Discover callable tools and
their required capabilities at \`GET ${origin}/api/tools/contracts\`
(authenticated). Tool playbooks (skills): \`GET ${origin}/ai/skills\`.

## Discovery

OAuth metadata incl. the \`agent_auth\` extension:
\`GET ${origin}/.well-known/oauth-authorization-server\`
`;
}

export function buildAuthorizationServerMetadata(origin: string) {
  return {
    issuer: "engenty-core",
    device_authorization_endpoint: `${origin}/api/auth/device/authorize`,
    token_endpoint: `${origin}/oauth2/token`,
    introspection_endpoint: `${origin}/api/auth/token/introspect`,
    revocation_endpoint: `${origin}/api/auth/token/revoke`,
    grant_types_supported: [
      "urn:ietf:params:oauth:grant-type:device_code",
      "refresh_token",
    ],
    token_endpoint_auth_methods_supported: ["none"],
    agent_auth: {
      skill: `${origin}/auth.md`,
      claim_endpoint: `${origin}/api/auth/device/authorize`,
      verification_uri: `${origin}/auth/device`,
      identity_types_supported: ["user_claimed"],
      assertion_types_supported: [],
    },
  };
}

export function registerAgentAuthDiscoveryRoutes(params: {
  app: OpenAPIHono;
}): void {
  params.app.get("/auth.md", (c) => {
    c.header("content-type", "text/markdown; charset=utf-8");
    return c.body(buildAuthMdManifest(resolveOrigin(c.req)));
  });
  params.app.get("/.well-known/oauth-authorization-server", (c) =>
    c.json(buildAuthorizationServerMetadata(resolveOrigin(c.req)))
  );
}
