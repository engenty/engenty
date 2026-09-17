import { createHash } from "node:crypto";
import { envString } from "@engenty/environment/env";
import {
  DEFAULT_MCP_AUDIENCE,
  GENERIC_ENGENTY_AUDIENCE,
} from "@engenty/mcp-server";

export function mcpResourceUrl(config: Record<string, unknown>): string {
  const explicit = envString(
    config,
    "mcpResourceUrl",
    "ENGENTY_MCP_RESOURCE_URL"
  );
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }
  const publicApp =
    envString(config, "publicAppUrl", "PUBLIC_APP_URL") ||
    envString(config, "engentyApiBaseUrl", "ENGENTY_API_BASE_URL");
  if (publicApp) {
    return `${publicApp.replace(/\/$/, "")}/mcp`;
  }
  return "http://127.0.0.1:8787/mcp";
}

export function mcpAudience(config: Record<string, unknown>): string {
  const explicit = envString(config, "mcpAudience", "ENGENTY_MCP_AUDIENCE");
  return explicit || mcpResourceUrl(config) || DEFAULT_MCP_AUDIENCE;
}

export function isMcpAudienceAllowed(
  tokenAudiences: string[],
  allowedAudience: string
): boolean {
  const allowed = new Set(
    [allowedAudience, DEFAULT_MCP_AUDIENCE].filter((value) => value.length > 0)
  );
  const hasMcpAudience = tokenAudiences.some((aud) => allowed.has(aud));
  if (!hasMcpAudience) {
    return false;
  }
  const onlyGeneric =
    tokenAudiences.length > 0 &&
    tokenAudiences.every((aud) => aud === GENERIC_ENGENTY_AUDIENCE);
  return !onlyGeneric;
}

export function hashMcpArguments(input: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(input ?? {}))
    .digest("hex");
}

export function mcpPrincipalId(clientId: string): string {
  return `mcp:${clientId}`;
}
