import {
  type AuthMetadataOptions,
  buildOAuthProtectedResourceMetadata,
  getOAuthProtectedResourceMetadataUrl,
  type OAuthProtectedResourceMetadata,
} from "@modelcontextprotocol/server";

export function mcpResourceMetadataUrl(resourceServerUrl: URL): string {
  return getOAuthProtectedResourceMetadataUrl(resourceServerUrl);
}

export function buildMcpProtectedResourceMetadata(
  options: AuthMetadataOptions
): OAuthProtectedResourceMetadata {
  return buildOAuthProtectedResourceMetadata(options);
}

export function wwwAuthenticateChallenge(params: {
  resourceMetadataUrl: string;
  error?: string;
  errorDescription?: string;
}): string {
  const parts = [
    'Bearer realm="engenty-mcp"',
    `resource_metadata="${params.resourceMetadataUrl}"`,
  ];
  if (params.error) {
    parts.push(`error="${params.error}"`);
  }
  if (params.errorDescription) {
    parts.push(`error_description="${params.errorDescription}"`);
  }
  return parts.join(", ");
}
